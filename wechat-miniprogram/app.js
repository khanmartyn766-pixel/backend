const seedPayload = require('./data/seed_bank.js');
const appConfig = require('./config.js');

const STORAGE_KEYS = {
  bank: 'mini_psy_bank_v1',
  progress: 'mini_psy_progress_v1',
  wrongBook: 'mini_psy_wrong_v1',
  seedVersion: 'mini_psy_seed_version_v1',
  authToken: 'mini_psy_auth_token_v1',
  userProfile: 'mini_psy_user_profile_v1',
  deviceId: 'mini_psy_device_id_v1'
};

function defaultProgress() {
  return {
    answered: 0,
    correct: 0,
    wrong: 0
  };
}

function normalizeAnswerSet(answer) {
  if (!Array.isArray(answer)) {
    return [];
  }
  return [...new Set(answer.map((x) => String(x).toUpperCase().trim()).filter(Boolean))].sort();
}

function normalizeQuestion(question, number) {
  if (!question || !question.stem) {
    return null;
  }

  const type = ['single', 'multiple', 'judge', 'short'].includes(question.type)
    ? question.type
    : 'single';

  const options = Array.isArray(question.options)
    ? question.options
        .filter((opt) => opt && opt.key && opt.text)
        .map((opt) => ({
          key: String(opt.key).toUpperCase(),
          text: String(opt.text)
        }))
    : [];

  return {
    id: question.id || `seed_q_${number}`,
    number: Number(question.number) || number,
    chapter: question.chapter || '未分章',
    type,
    stem: String(question.stem),
    options,
    answer: normalizeAnswerSet(question.answer),
    answerText: String(question.answerText || ''),
    explanation: String(question.explanation || '')
  };
}

function shuffle(arr) {
  const copied = [...arr];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copied[i];
    copied[i] = copied[j];
    copied[j] = temp;
  }
  return copied;
}

function answerSetEquals(selected, answer) {
  if (selected.length !== answer.length) {
    return false;
  }
  return selected.every((item, index) => item === answer[index]);
}

App({
  globalData: {
    bank: [],
    progress: defaultProgress(),
    wrongBook: {},
    session: null,
    seedVersion: seedPayload.version || 'psych-seed-mini',
    questionMap: {},
    requireAuth: !!appConfig.REQUIRE_AUTH,
    apiBaseUrl: String(appConfig.API_BASE_URL || '').replace(/\/$/, ''),
    authToken: '',
    userProfile: null,
    deviceId: ''
  },

  onLaunch() {
    this.bootstrap();
  },

  bootstrap() {
    const cachedVersion = this.readStorage(STORAGE_KEYS.seedVersion, '');
    const cachedBank = this.readStorage(STORAGE_KEYS.bank, []);
    const cachedProgress = this.readStorage(STORAGE_KEYS.progress, defaultProgress());
    const cachedWrongBook = this.readStorage(STORAGE_KEYS.wrongBook, {});

    if (cachedVersion !== this.globalData.seedVersion || !Array.isArray(cachedBank) || cachedBank.length === 0) {
      const normalized = (seedPayload.questions || [])
        .map((item, idx) => normalizeQuestion(item, idx + 1))
        .filter(Boolean);

      this.globalData.bank = normalized;
      this.globalData.progress = defaultProgress();
      this.globalData.wrongBook = {};

      this.writeStorage(STORAGE_KEYS.bank, normalized);
      this.writeStorage(STORAGE_KEYS.progress, this.globalData.progress);
      this.writeStorage(STORAGE_KEYS.wrongBook, this.globalData.wrongBook);
      this.writeStorage(STORAGE_KEYS.seedVersion, this.globalData.seedVersion);
    } else {
      this.globalData.bank = cachedBank;
      this.globalData.progress = {
        answered: Number(cachedProgress.answered || 0),
        correct: Number(cachedProgress.correct || 0),
        wrong: Number(cachedProgress.wrong || 0)
      };
      this.globalData.wrongBook = cachedWrongBook || {};
    }

    this.globalData.authToken = this.readStorage(STORAGE_KEYS.authToken, '');
    this.globalData.userProfile = this.readStorage(STORAGE_KEYS.userProfile, null);
    this.globalData.deviceId = this.ensureDeviceId();

    this.rebuildQuestionMap();
  },

  rebuildQuestionMap() {
    const map = {};
    this.globalData.bank.forEach((q) => {
      map[q.id] = q;
    });
    this.globalData.questionMap = map;
  },

  readStorage(key, fallback) {
    try {
      const value = wx.getStorageSync(key);
      return value === '' || value === undefined ? fallback : value;
    } catch (error) {
      return fallback;
    }
  },

  writeStorage(key, value) {
    try {
      wx.setStorageSync(key, value);
    } catch (error) {
      // ignore storage exceptions
    }
  },

  ensureDeviceId() {
    const cached = this.readStorage(STORAGE_KEYS.deviceId, '');
    if (cached) {
      return cached;
    }

    const sys = wx.getSystemInfoSync();
    const random = `${Date.now()}_${Math.floor(Math.random() * 1e8)}`;
    const deviceId = `wxmini_${sys.platform || 'unknown'}_${random}`;
    this.writeStorage(STORAGE_KEYS.deviceId, deviceId);
    return deviceId;
  },

  getDeviceContext() {
    const sys = wx.getSystemInfoSync();
    return {
      deviceId: this.globalData.deviceId,
      deviceName: `${sys.brand || ''} ${sys.model || ''}`.trim() || 'unknown-device',
      platform: sys.platform || 'unknown'
    };
  },

  isAuthRequired() {
    return this.globalData.requireAuth;
  },

  isAuthenticated() {
    if (!this.isAuthRequired()) {
      return true;
    }
    return !!this.globalData.authToken;
  },

  getUserProfile() {
    return this.globalData.userProfile;
  },

  setAuthState(token, userProfile) {
    this.globalData.authToken = token;
    this.globalData.userProfile = userProfile;
    this.writeStorage(STORAGE_KEYS.authToken, token);
    this.writeStorage(STORAGE_KEYS.userProfile, userProfile);
  },

  clearAuthState() {
    this.globalData.authToken = '';
    this.globalData.userProfile = null;
    this.writeStorage(STORAGE_KEYS.authToken, '');
    this.writeStorage(STORAGE_KEYS.userProfile, null);
  },

  logout() {
    this.clearAuthState();
    this.clearSession();
  },

  request({ path, method = 'GET', data = null, auth = false }) {
    const base = this.globalData.apiBaseUrl;
    if (!base) {
      return Promise.reject(new Error('未配置 API_BASE_URL')); 
    }

    const headers = {
      'content-type': 'application/json'
    };

    if (auth) {
      if (!this.globalData.authToken) {
        return Promise.reject(new Error('未登录')); 
      }
      headers.Authorization = `Bearer ${this.globalData.authToken}`;
    }

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${base}${path}`,
        method,
        data,
        header: headers,
        success: (res) => {
          const status = Number(res.statusCode || 0);
          if (status >= 200 && status < 300) {
            resolve(res.data);
            return;
          }

          const msg = (res.data && (res.data.message || res.data.error)) || `请求失败(${status})`;
          reject(new Error(Array.isArray(msg) ? msg.join('; ') : String(msg)));
        },
        fail: (err) => {
          reject(new Error((err && err.errMsg) || '网络请求失败'));
        }
      });
    });
  },

  async checkStudentAccess(payload) {
    const reqData = {
      phone: payload.phone,
      inviteCode: payload.inviteCode
    };
    if (payload.studentNo) {
      reqData.studentNo = payload.studentNo;
    }

    return this.request({
      path: '/auth/check-student-access',
      method: 'POST',
      data: reqData
    });
  },

  async registerWithStudent(payload) {
    const device = this.getDeviceContext();
    const reqData = {
      phone: payload.phone,
      password: payload.password,
      inviteCode: payload.inviteCode,
      nickname: payload.nickname,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform
    };
    if (payload.studentNo) {
      reqData.studentNo = payload.studentNo;
    }

    const data = await this.request({
      path: '/auth/register',
      method: 'POST',
      data: reqData
    });

    this.setAuthState(data.token, data.user);
    return data;
  },

  async loginWithStudent(payload) {
    const device = this.getDeviceContext();
    const data = await this.request({
      path: '/auth/login',
      method: 'POST',
      data: {
        phone: payload.phone,
        password: payload.password,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        platform: device.platform
      }
    });

    this.setAuthState(data.token, data.user);
    return data;
  },

  async refreshMe() {
    if (!this.globalData.authToken) {
      return null;
    }

    const me = await this.request({
      path: '/auth/me',
      method: 'GET',
      auth: true
    });

    this.setAuthState(this.globalData.authToken, me);
    return me;
  },

  persistProgress() {
    this.writeStorage(STORAGE_KEYS.progress, this.globalData.progress);
  },

  persistWrongBook() {
    this.writeStorage(STORAGE_KEYS.wrongBook, this.globalData.wrongBook);
  },

  getBankQuestions() {
    return this.globalData.bank;
  },

  getChapterList() {
    const chapterSet = new Set();
    this.globalData.bank.forEach((q) => chapterSet.add(q.chapter || '未分章'));
    return [...chapterSet];
  },

  getQuestionById(questionId) {
    return this.globalData.questionMap[questionId] || null;
  },

  getProgress() {
    return this.globalData.progress;
  },

  resetProgressAndWrongBook() {
    this.globalData.progress = defaultProgress();
    this.globalData.wrongBook = {};
    this.persistProgress();
    this.persistWrongBook();
  },

  getWrongBookArray() {
    return Object.values(this.globalData.wrongBook || {}).sort((a, b) => {
      return (b.wrongCount || 0) - (a.wrongCount || 0);
    });
  },

  clearWrongBook() {
    this.globalData.wrongBook = {};
    this.persistWrongBook();
  },

  createSession(params = {}) {
    const chapter = params.chapter || 'all';
    const scope = params.scope || 'all';
    const mode = params.mode || 'sequential';

    let questions = this.globalData.bank;

    if (scope === 'wrong') {
      const wrongIds = new Set(Object.keys(this.globalData.wrongBook || {}));
      questions = questions.filter((q) => wrongIds.has(q.id));
    }

    if (chapter !== 'all') {
      questions = questions.filter((q) => q.chapter === chapter);
    }

    if (mode === 'random') {
      questions = shuffle(questions);
    } else {
      questions = [...questions].sort((a, b) => a.number - b.number);
    }

    if (!questions.length) {
      return null;
    }

    this.globalData.session = {
      queue: questions.map((q) => q.id),
      pointer: 0,
      answers: {},
      chapter,
      scope,
      mode,
      startedAt: Date.now()
    };

    return this.globalData.session;
  },

  getSession() {
    return this.globalData.session;
  },

  saveSession(session) {
    this.globalData.session = session;
  },

  clearSession() {
    this.globalData.session = null;
  },

  getCurrentQuestion(session) {
    if (!session || !session.queue || !session.queue.length) {
      return null;
    }
    const questionId = session.queue[session.pointer];
    return this.getQuestionById(questionId);
  },

  addWrongRecord(question, selected, selectedText) {
    const current = this.globalData.wrongBook[question.id];
    const answerText = question.type === 'short'
      ? (selectedText || '未作答')
      : (selected && selected.length ? selected.join('、') : '未作答');

    this.globalData.wrongBook[question.id] = {
      questionId: question.id,
      wrongCount: current ? current.wrongCount + 1 : 1,
      lastWrongAt: Date.now(),
      chapter: question.chapter,
      type: question.type,
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      answerText: question.answerText,
      explanation: question.explanation,
      lastUserAnswer: answerText
    };

    this.persistWrongBook();
  },

  submitAnswer(payload) {
    const session = this.globalData.session;
    if (!session) {
      return { ok: false, message: '会话不存在' };
    }

    const question = this.getQuestionById(payload.questionId);
    if (!question) {
      return { ok: false, message: '题目不存在' };
    }

    const exists = !!session.answers[question.id];
    if (exists) {
      return { ok: false, message: '本题已提交' };
    }

    const selected = normalizeAnswerSet(payload.selected || []);
    const selectedText = String(payload.selectedText || '').trim();

    let correct = false;
    if (question.type !== 'short') {
      correct = answerSetEquals(selected, question.answer);
    }

    session.answers[question.id] = {
      selected,
      selectedText,
      correct,
      submittedAt: Date.now()
    };

    this.saveSession(session);

    this.globalData.progress.answered += 1;
    if (question.type !== 'short') {
      if (correct) {
        this.globalData.progress.correct += 1;
      } else {
        this.globalData.progress.wrong += 1;
        this.addWrongRecord(question, selected, selectedText);
      }
    }
    this.persistProgress();

    return {
      ok: true,
      question,
      record: session.answers[question.id]
    };
  }
});

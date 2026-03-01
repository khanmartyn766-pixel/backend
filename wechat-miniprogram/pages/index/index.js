const MODE_OPTIONS = [
  { label: '顺序练习', value: 'sequential' },
  { label: '随机练习', value: 'random' }
];

const SCOPE_OPTIONS = [
  { label: '全部题目', value: 'all' },
  { label: '仅错题', value: 'wrong' }
];

Page({
  data: {
    stats: {
      answered: 0,
      correct: 0,
      wrong: 0
    },
    wrongCount: 0,
    bankCount: 0,
    chapterOptions: [{ label: '全部章节', value: 'all' }],
    chapterLabels: ['全部章节'],
    chapterIndex: 0,
    modeOptions: MODE_OPTIONS,
    modeLabels: MODE_OPTIONS.map((x) => x.label),
    modeIndex: 0,
    scopeOptions: SCOPE_OPTIONS,
    scopeLabels: SCOPE_OPTIONS.map((x) => x.label),
    scopeIndex: 0,
    userProfile: null,
    authRequired: true
  },

  async onShow() {
    const app = getApp();
    const authRequired = app.isAuthRequired();

    if (authRequired && !app.isAuthenticated()) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }

    if (authRequired) {
      try {
        await app.refreshMe();
      } catch (error) {
        app.logout();
        wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
        wx.redirectTo({ url: '/pages/login/login' });
        return;
      }
    }

    this.refresh();
  },

  refresh() {
    const app = getApp();
    const chapters = app.getChapterList();
    const chapterOptions = [{ label: '全部章节', value: 'all' }].concat(
      chapters.map((chapter) => ({ label: chapter, value: chapter }))
    );

    this.setData({
      stats: app.getProgress(),
      wrongCount: app.getWrongBookArray().length,
      bankCount: app.getBankQuestions().length,
      chapterOptions,
      chapterLabels: chapterOptions.map((x) => x.label),
      chapterIndex: 0,
      userProfile: app.getUserProfile(),
      authRequired: app.isAuthRequired()
    });
  },

  onChangeChapter(event) {
    this.setData({ chapterIndex: Number(event.detail.value || 0) });
  },

  onChangeMode(event) {
    this.setData({ modeIndex: Number(event.detail.value || 0) });
  },

  onChangeScope(event) {
    this.setData({ scopeIndex: Number(event.detail.value || 0) });
  },

  onStartPractice() {
    const app = getApp();
    const chapter = this.data.chapterOptions[this.data.chapterIndex].value;
    const mode = this.data.modeOptions[this.data.modeIndex].value;
    const scope = this.data.scopeOptions[this.data.scopeIndex].value;

    const session = app.createSession({ chapter, mode, scope });
    if (!session) {
      wx.showModal({
        title: '无法开始',
        content: '当前条件下没有可练习题目，请调整章节或范围。',
        showCancel: false
      });
      return;
    }

    wx.navigateTo({
      url: '/pages/practice/practice'
    });
  },

  onOpenWrongbook() {
    wx.navigateTo({
      url: '/pages/wrongbook/wrongbook'
    });
  },

  onResetProgress() {
    wx.showModal({
      title: '重置确认',
      content: '将清空累计进度和错题本，是否继续？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        getApp().resetProgressAndWrongBook();
        this.refresh();
        wx.showToast({ title: '已重置', icon: 'success' });
      }
    });
  },

  onLogout() {
    getApp().logout();
    wx.redirectTo({ url: '/pages/login/login' });
  }
});

function typeToLabel(type) {
  const map = {
    single: '单选题',
    multiple: '多选题',
    judge: '判断题',
    short: '简答题'
  };
  return map[type] || '题目';
}

function typeToBadgeClass(type) {
  if (type === 'multiple') return 'badge-danger';
  if (type === 'short') return 'badge-ok';
  return 'badge-ok';
}

function toSelectedMap(selected) {
  const map = {};
  (selected || []).forEach((key) => {
    map[key] = true;
  });
  return map;
}

Page({
  data: {
    question: null,
    index: 0,
    total: 0,
    selected: [],
    selectedMap: {},
    shortInput: '',
    submitted: false,
    feedback: null,
    canPrev: false,
    canNext: false,
    isObjective: false,
    isShort: false,
    questionTypeLabel: '',
    typeBadgeClass: 'badge-ok',
    submitBtnText: '提交答案'
  },

  onShow() {
    const app = getApp();
    if (app.isAuthRequired() && !app.isAuthenticated()) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.loadCurrentQuestion();
  },

  loadCurrentQuestion() {
    const app = getApp();
    const session = app.getSession();

    if (!session) {
      wx.showModal({
        title: '提示',
        content: '当前没有正在进行的练习。',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1 })
      });
      return;
    }

    const question = app.getCurrentQuestion(session);
    if (!question) {
      this.finishAndBack();
      return;
    }

    const record = session.answers[question.id] || null;
    const selected = record ? record.selected || [] : [];
    const shortInput = record ? record.selectedText || '' : '';
    const submitted = !!record;

    this.setData({
      question,
      index: session.pointer + 1,
      total: session.queue.length,
      selected,
      selectedMap: toSelectedMap(selected),
      shortInput,
      submitted,
      feedback: submitted ? this.buildFeedback(question, record) : null,
      canPrev: session.pointer > 0,
      canNext: session.pointer < session.queue.length - 1,
      isObjective: question.type !== 'short',
      isShort: question.type === 'short',
      questionTypeLabel: typeToLabel(question.type),
      typeBadgeClass: typeToBadgeClass(question.type),
      submitBtnText: question.type === 'short' ? '保存作答' : '提交答案'
    });
  },

  onTapOption(event) {
    if (this.data.submitted || !this.data.question) {
      return;
    }

    const key = event.currentTarget.dataset.key;
    const questionType = this.data.question.type;
    let selected = [...this.data.selected];

    if (questionType === 'single' || questionType === 'judge') {
      selected = [key];
    } else {
      const exists = selected.includes(key);
      if (exists) {
        selected = selected.filter((x) => x !== key);
      } else {
        selected.push(key);
      }
      selected.sort();
    }

    this.setData({
      selected,
      selectedMap: toSelectedMap(selected)
    });
  },

  onInputShort(event) {
    if (this.data.submitted) {
      return;
    }
    this.setData({ shortInput: event.detail.value || '' });
  },

  onSubmit() {
    const question = this.data.question;
    if (!question || this.data.submitted) {
      return;
    }

    if (question.type !== 'short' && this.data.selected.length === 0) {
      wx.showToast({ title: '请先选择答案', icon: 'none' });
      return;
    }

    const result = getApp().submitAnswer({
      questionId: question.id,
      selected: this.data.selected,
      selectedText: this.data.shortInput
    });

    if (!result.ok) {
      wx.showToast({ title: result.message || '提交失败', icon: 'none' });
      return;
    }

    this.setData({
      submitted: true,
      feedback: this.buildFeedback(result.question, result.record)
    });

    wx.showToast({ title: '已提交', icon: 'success' });
  },

  buildFeedback(question, record) {
    if (question.type === 'short') {
      const refAnswer = question.answerText || question.explanation || '暂无参考答案';
      return {
        title: '主观题已保存',
        statusClass: 'feedback-neutral',
        userAnswer: record.selectedText || '未作答',
        answer: refAnswer,
        explanation: question.explanation || ''
      };
    }

    const rightAnswer = (question.answer || []).join('、') || '暂无';
    const userAnswer = (record.selected || []).join('、') || '未作答';
    const isCorrect = !!record.correct;

    return {
      title: isCorrect ? '回答正确' : '回答错误',
      statusClass: isCorrect ? 'feedback-ok' : 'feedback-bad',
      userAnswer,
      answer: rightAnswer,
      explanation: question.explanation || ''
    };
  },

  onPrev() {
    if (!this.data.canPrev) {
      return;
    }
    const app = getApp();
    const session = app.getSession();
    if (!session) {
      return;
    }
    session.pointer -= 1;
    app.saveSession(session);
    this.loadCurrentQuestion();
  },

  onNext() {
    if (!this.data.canNext) {
      return;
    }

    const go = () => {
      const app = getApp();
      const session = app.getSession();
      if (!session) {
        return;
      }
      session.pointer += 1;
      app.saveSession(session);
      this.loadCurrentQuestion();
    };

    if (!this.data.submitted) {
      wx.showModal({
        title: '未提交本题',
        content: '你还没有提交本题，确定跳过并进入下一题吗？',
        success: (res) => {
          if (res.confirm) {
            go();
          }
        }
      });
      return;
    }

    go();
  },

  onFinish() {
    wx.showModal({
      title: '结束练习',
      content: '确认结束本次练习并返回首页吗？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.finishAndBack();
      }
    });
  },

  finishAndBack() {
    getApp().clearSession();
    wx.navigateBack({ delta: 1 });
  }
});

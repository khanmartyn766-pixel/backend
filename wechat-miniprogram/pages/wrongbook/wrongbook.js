Page({
  data: {
    items: [],
    answerMap: {}
  },

  onShow() {
    const app = getApp();
    if (app.isAuthRequired() && !app.isAuthenticated()) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.refresh();
  },

  refresh() {
    const items = getApp().getWrongBookArray();
    const answerMap = {};

    items.forEach((item) => {
      const answerArr = Array.isArray(item.answer) ? item.answer : [];
      answerMap[item.questionId] = answerArr.length ? answerArr.join('、') : '暂无';
    });

    this.setData({ items, answerMap });
  },

  onClearAll() {
    wx.showModal({
      title: '清空确认',
      content: '确认清空全部错题记录吗？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        getApp().clearWrongBook();
        this.refresh();
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  }
});

function validatePhone(phone) {
  return /^1\d{10}$/.test(phone);
}

Page({
  data: {
    mode: 'login',
    phone: '',
    inviteCode: '',
    password: '',
    nickname: '',
    loading: false,
    apiBaseUrl: ''
  },

  onShow() {
    const app = getApp();

    if (!app.isAuthRequired()) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }

    if (app.isAuthenticated()) {
      wx.redirectTo({ url: '/pages/index/index' });
      return;
    }

    this.setData({
      apiBaseUrl: app.globalData.apiBaseUrl
    });
  },

  onSwitchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    this.setData({ mode });
  },

  onInputPhone(event) {
    this.setData({ phone: (event.detail.value || '').trim() });
  },

  onInputInviteCode(event) {
    this.setData({ inviteCode: (event.detail.value || '').trim() });
  },

  onInputPassword(event) {
    this.setData({ password: (event.detail.value || '').trim() });
  },

  onInputNickname(event) {
    this.setData({ nickname: (event.detail.value || '').trim() });
  },

  async onSubmit() {
    if (this.data.loading) {
      return;
    }

    const payload = {
      phone: this.data.phone,
      password: this.data.password,
      inviteCode: this.data.inviteCode,
      nickname: this.data.nickname
    };

    if (!validatePhone(payload.phone)) {
      wx.showToast({ title: '手机号格式错误', icon: 'none' });
      return;
    }

    if (!payload.password || payload.password.length < 8) {
      wx.showToast({ title: '密码至少8位', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    const app = getApp();
    try {
      if (this.data.mode === 'register') {
        if (!payload.inviteCode) {
          throw new Error('请填写邀请码');
        }

        await app.checkStudentAccess({
          phone: payload.phone,
          inviteCode: payload.inviteCode
        });

        await app.registerWithStudent(payload);
      } else {
        await app.loginWithStudent(payload);
      }

      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.redirectTo({ url: '/pages/index/index' });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});

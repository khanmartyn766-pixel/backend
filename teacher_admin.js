const els = {
  apiBase: document.getElementById('apiBase'),
  adminSecret: document.getElementById('adminSecret'),
  btnLoad: document.getElementById('btnLoad'),
  btnTemplate: document.getElementById('btnTemplate'),
  globalStatus: document.getElementById('globalStatus'),
  filterStatus: document.getElementById('filterStatus'),
  filterClass: document.getElementById('filterClass'),
  filterKeyword: document.getElementById('filterKeyword'),
  btnFilter: document.getElementById('btnFilter'),
  fStudentNo: document.getElementById('fStudentNo'),
  fName: document.getElementById('fName'),
  fPhone: document.getElementById('fPhone'),
  fClassName: document.getElementById('fClassName'),
  fInviteCode: document.getElementById('fInviteCode'),
  fMaxDevices: document.getElementById('fMaxDevices'),
  fExpiresAt: document.getElementById('fExpiresAt'),
  fStatus: document.getElementById('fStatus'),
  btnUpsert: document.getElementById('btnUpsert'),
  csvText: document.getElementById('csvText'),
  btnImportCsv: document.getElementById('btnImportCsv'),
  importStatus: document.getElementById('importStatus'),
  listMeta: document.getElementById('listMeta'),
  studentsTbody: document.getElementById('studentsTbody'),
};

async function api(path, method = 'GET', body = null, plainText = false) {
  const base = els.apiBase.value.trim().replace(/\/$/, '');
  const secret = els.adminSecret.value.trim();
  if (!base || !secret) {
    throw new Error('请先填写 API Base 和 Admin Secret');
  }

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `请求失败(${res.status})`;
    try {
      const payload = await res.json();
      msg = payload?.message ? (Array.isArray(payload.message) ? payload.message.join('; ') : payload.message) : msg;
    } catch (_) {
      // ignore
    }
    throw new Error(msg);
  }

  return plainText ? res.text() : res.json();
}

function setStatus(message, isError = false) {
  els.globalStatus.textContent = message;
  els.globalStatus.style.color = isError ? '#c92a2a' : '#087f5b';
}

function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRows(items) {
  if (!items.length) {
    els.studentsTbody.innerHTML = '<tr><td colspan="9">暂无数据</td></tr>';
    return;
  }

  els.studentsTbody.innerHTML = items
    .map((item) => {
      const statusCls = item.status === 'ACTIVE' ? 'active' : 'frozen';
      const deviceText = item.user ? `${item.user.deviceCount}/${item.maxDevices}` : `0/${item.maxDevices}`;
      return `
        <tr>
          <td>${escapeHtml(item.studentNo)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.phone)}</td>
          <td>${escapeHtml(item.className || '-')}</td>
          <td><span class="tag ${statusCls}">${escapeHtml(item.status)}</span></td>
          <td>${escapeHtml(item.inviteCode)}</td>
          <td>${escapeHtml(deviceText)}</td>
          <td>${escapeHtml(fmtDate(item.expiresAt))}</td>
          <td>
            <button data-id="${escapeHtml(item.id)}" data-action="toggle">${item.status === 'ACTIVE' ? '冻结' : '解冻'}</button>
            <button data-id="${escapeHtml(item.id)}" data-action="limit">设备上限</button>
            <button data-id="${escapeHtml(item.id)}" data-action="reset" class="danger">清设备</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function loadStudents() {
  const params = new URLSearchParams();
  if (els.filterStatus.value) params.set('status', els.filterStatus.value);
  if (els.filterClass.value.trim()) params.set('className', els.filterClass.value.trim());
  if (els.filterKeyword.value.trim()) params.set('keyword', els.filterKeyword.value.trim());
  params.set('page', '1');
  params.set('pageSize', '100');

  const data = await api(`/admin/students?${params.toString()}`);
  renderRows(data.items || []);
  els.listMeta.textContent = `共 ${data.pagination.total} 人，当前 ${data.items.length} 条`;
  setStatus('学生列表已更新');
}

async function upsertStudent() {
  const payload = {
    studentNo: els.fStudentNo.value.trim(),
    name: els.fName.value.trim(),
    phone: els.fPhone.value.trim(),
    className: els.fClassName.value.trim() || undefined,
    inviteCode: els.fInviteCode.value.trim(),
    maxDevices: Number(els.fMaxDevices.value || 1),
    expiresAt: els.fExpiresAt.value.trim() || undefined,
    status: els.fStatus.value,
  };

  if (!payload.studentNo || !payload.name || !payload.phone || !payload.inviteCode) {
    throw new Error('学号/姓名/手机号/邀请码为必填项');
  }

  await api('/admin/students/upsert', 'POST', payload);
  setStatus('学生信息保存成功');
  await loadStudents();
}

async function importCsv() {
  const csvText = els.csvText.value.trim();
  if (!csvText) throw new Error('请先粘贴 CSV 内容');
  const result = await api('/admin/students/import-csv', 'POST', { csvText });
  els.importStatus.textContent = `导入完成：created=${result.created}, updated=${result.updated}, skipped=${result.skipped}`;
  els.importStatus.style.color = '#087f5b';
  await loadStudents();
}

async function downloadTemplate() {
  const txt = await api('/admin/students/template-csv', 'GET', null, true);
  const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleTableAction(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;

  const studentId = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'toggle') {
    const next = btn.textContent === '冻结' ? 'FROZEN' : 'ACTIVE';
    await api(`/admin/students/${studentId}/status`, 'PATCH', { status: next });
    await loadStudents();
    return;
  }

  if (action === 'limit') {
    const input = prompt('请输入新的设备上限（1-10）', '1');
    if (!input) return;
    const maxDevices = Number(input);
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) {
      throw new Error('设备上限必须是 1-10 的整数');
    }
    await api(`/admin/students/${studentId}/device-limit`, 'PATCH', { maxDevices });
    await loadStudents();
    return;
  }

  if (action === 'reset') {
    if (!confirm('确认清空该学生已绑定设备吗？')) return;
    await api(`/admin/students/${studentId}/reset-devices`, 'POST', {});
    await loadStudents();
  }
}

async function safeRun(fn) {
  try {
    await fn();
  } catch (error) {
    setStatus(error.message || '操作失败', true);
  }
}

els.btnLoad.addEventListener('click', () => safeRun(loadStudents));
els.btnFilter.addEventListener('click', () => safeRun(loadStudents));
els.btnUpsert.addEventListener('click', () => safeRun(upsertStudent));
els.btnImportCsv.addEventListener('click', () => safeRun(importCsv));
els.btnTemplate.addEventListener('click', () => safeRun(downloadTemplate));
els.studentsTbody.addEventListener('click', (event) => safeRun(() => handleTableAction(event)));

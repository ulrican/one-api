import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Divider,
  Form,
  Header,
  Input,
  Label,
  Modal,
  Table,
} from 'semantic-ui-react';
import { API, showError, showSuccess, timestamp2string } from '../helpers';

// Task4-3 倍率自动计算 + 分组倍率维护（与既有手动 JSON 倍率区块并存，互不替代）。
// onRatioChanged：实际重算/锁定生效后回调父组件刷新 JSON 文本域，避免展示旧值被误存。
const PREVIEW_LIMIT = 200;

const RatioAutoSetting = ({ onRatioChanged }) => {
  const { t } = useTranslation();

  // ---------- 自动重算 ----------
  const [previewOpen, setPreviewOpen] = useState(false);
  const [changes, setChanges] = useState([]);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const previewRecompute = async () => {
    setPreviewing(true);
    try {
      const res = await API.post('/api/ratio/auto-recompute', {
        dry_run: true,
      });
      const { success, message, data } = res.data;
      if (success) {
        setChanges(data.changes || []);
        setPreviewOpen(true);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setPreviewing(false);
  };

  const applyRecompute = async () => {
    setApplying(true);
    try {
      const res = await API.post('/api/ratio/auto-recompute', {
        dry_run: false,
      });
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(
          t('setting.operation.ratio_auto.applied', { count: data.count })
        );
        setPreviewOpen(false);
        await loadLocks();
        onRatioChanged?.();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setApplying(false);
  };

  // ---------- 锁定列表 ----------
  const [locks, setLocks] = useState([]);

  const loadLocks = async () => {
    try {
      const res = await API.get('/api/ratio/locks');
      const { success, message, data } = res.data;
      if (success) {
        setLocks(data || []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
  };

  useEffect(() => {
    loadLocks().then();
  }, []);

  const unlock = async (modelId) => {
    if (!window.confirm(t('setting.operation.ratio_auto.unlock_confirm', { modelId }))) {
      return;
    }
    try {
      const res = await API.delete('/api/ratio/lock', {
        params: { model_id: modelId },
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('setting.operation.ratio_auto.unlock_success'));
        await loadLocks();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
  };

  // ---------- 新增/更新锁定 ----------
  const [lockOpen, setLockOpen] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [lockForm, setLockForm] = useState({
    model_id: '',
    model_ratio: '',
    completion_ratio: '',
    note: '',
  });

  const openLockModal = (row) => {
    if (row) {
      setLockForm({
        model_id: row.model_id,
        model_ratio: String(row.model_ratio ?? ''),
        completion_ratio: String(row.completion_ratio ?? ''),
        note: row.note || '',
      });
    } else {
      setLockForm({ model_id: '', model_ratio: '', completion_ratio: '', note: '' });
    }
    setLockOpen(true);
  };

  const submitLock = async () => {
    if (!lockForm.model_id.trim()) {
      showError(t('setting.operation.ratio_auto.lock_form.model_id_required'));
      return;
    }
    const body = {
      model_id: lockForm.model_id.trim(),
      note: lockForm.note,
    };
    if (lockForm.model_ratio !== '') {
      const v = parseFloat(lockForm.model_ratio);
      if (Number.isNaN(v) || v < 0) {
        showError(t('setting.operation.ratio_auto.lock_form.ratio_invalid'));
        return;
      }
      body.model_ratio = v;
    }
    if (lockForm.completion_ratio !== '') {
      const v = parseFloat(lockForm.completion_ratio);
      if (Number.isNaN(v) || v < 0) {
        showError(t('setting.operation.ratio_auto.lock_form.ratio_invalid'));
        return;
      }
      body.completion_ratio = v;
    }
    setLockSaving(true);
    try {
      const res = await API.post('/api/ratio/lock', body);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('setting.operation.ratio_auto.lock_form.save_success'));
        setLockOpen(false);
        await loadLocks();
        onRatioChanged?.();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setLockSaving(false);
  };

  // ---------- 分组倍率 ----------
  const [groupRows, setGroupRows] = useState([]);
  const [groupSaving, setGroupSaving] = useState(false);

  const loadGroups = async () => {
    try {
      const res = await API.get('/api/ratio/groups');
      const { success, message, data } = res.data;
      if (success) {
        const rows = Object.entries(data || {}).map(([name, ratio]) => ({
          name,
          ratio: String(ratio),
          isNew: false,
        }));
        rows.sort((a, b) => {
          if (a.name === 'default') return -1;
          if (b.name === 'default') return 1;
          return a.name.localeCompare(b.name);
        });
        setGroupRows(rows);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
  };

  useEffect(() => {
    loadGroups().then();
  }, []);

  const updateGroupRow = (idx, patch) => {
    setGroupRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  };

  const removeGroupRow = (idx) => {
    const row = groupRows[idx];
    if (row.name === 'default') {
      showError(t('setting.operation.group_ratio.default_no_delete'));
      return;
    }
    if (!window.confirm(t('setting.operation.group_ratio.delete_confirm', { name: row.name }))) {
      return;
    }
    setGroupRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const saveGroups = async () => {
    const groups = {};
    const seen = new Set();
    for (const row of groupRows) {
      const name = row.name.trim();
      if (!name) {
        showError(t('setting.operation.group_ratio.name_required'));
        return;
      }
      if (seen.has(name)) {
        showError(t('setting.operation.group_ratio.name_duplicate', { name }));
        return;
      }
      seen.add(name);
      const r = parseFloat(row.ratio);
      if (Number.isNaN(r) || r < 0) {
        showError(t('setting.operation.group_ratio.ratio_invalid', { name }));
        return;
      }
      groups[name] = r;
    }
    if (groups.default === undefined) {
      showError(t('setting.operation.group_ratio.default_required'));
      return;
    }
    if (groups.default < 0.1) {
      showError(t('setting.operation.group_ratio.default_min'));
      return;
    }
    setGroupSaving(true);
    try {
      const res = await API.post('/api/ratio/groups', { groups });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('setting.operation.group_ratio.saved'));
        await loadGroups();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setGroupSaving(false);
  };

  const renderRatioDelta = (oldV, newV) => {
    if (oldV === null || oldV === undefined) {
      return (
        <span>
          <Label size='tiny' color='grey'>—</Label>
          {' → '}
          <strong>{newV}</strong>
        </span>
      );
    }
    return (
      <span>
        {oldV} → <strong>{newV}</strong>
      </span>
    );
  };

  return (
    <>
      <Divider />
      <Header as='h3'>{t('setting.operation.ratio_auto.title')}</Header>
      <p style={{ color: 'var(--text-secondary)', marginTop: -8 }}>
        {t('setting.operation.ratio_auto.desc')}
      </p>
      <Form.Group inline>
        <Button
          primary
          loading={previewing}
          onClick={() => {
            previewRecompute().then();
          }}
        >
          {t('setting.operation.ratio_auto.preview_btn')}
        </Button>
        <Button
          onClick={() => {
            loadLocks().then();
          }}
        >
          {t('setting.operation.ratio_auto.refresh_locks')}
        </Button>
      </Form.Group>

      <Header as='h4' style={{ marginTop: 16 }}>
        {t('setting.operation.ratio_auto.locks_title')}
        <Label circular size='small' style={{ marginLeft: 8 }}>
          {locks.length}
        </Label>
      </Header>
      <Form.Group inline>
        <Button
          size='small'
          onClick={() => {
            openLockModal(null);
          }}
        >
          {t('setting.operation.ratio_auto.add_lock')}
        </Button>
      </Form.Group>
      <Table compact size='small' striped>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>
              {t('setting.operation.ratio_auto.col_model_id')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.ratio_auto.col_model_ratio')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.ratio_auto.col_completion_ratio')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.ratio_auto.col_locked_at')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.ratio_auto.col_note')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.ratio_auto.col_actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {locks.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan='6' style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                {t('setting.operation.ratio_auto.no_locks')}
              </Table.Cell>
            </Table.Row>
          )}
          {locks.map((row) => (
            <Table.Row key={row.model_id}>
              <Table.Cell style={{ wordBreak: 'break-all' }}>
                {row.model_id}
              </Table.Cell>
              <Table.Cell>{row.model_ratio}</Table.Cell>
              <Table.Cell>{row.completion_ratio}</Table.Cell>
              <Table.Cell>{timestamp2string(row.locked_at)}</Table.Cell>
              <Table.Cell>{row.note || '—'}</Table.Cell>
              <Table.Cell>
                <Button
                  size='mini'
                  onClick={() => {
                    openLockModal(row);
                  }}
                >
                  {t('setting.operation.ratio_auto.btn_edit')}
                </Button>
                <Button
                  size='mini'
                  color='red'
                  onClick={() => {
                    unlock(row.model_id).then();
                  }}
                >
                  {t('setting.operation.ratio_auto.btn_unlock')}
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <Divider />
      <Header as='h3'>{t('setting.operation.group_ratio.title')}</Header>
      <p style={{ color: 'var(--text-secondary)', marginTop: -8 }}>
        {t('setting.operation.group_ratio.desc')}
      </p>
      <Table compact size='small' collapsing>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>
              {t('setting.operation.group_ratio.col_name')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.group_ratio.col_ratio')}
            </Table.HeaderCell>
            <Table.HeaderCell>
              {t('setting.operation.group_ratio.col_actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {groupRows.map((row, idx) => (
            <Table.Row key={idx}>
              <Table.Cell>
                <Input
                  value={row.name}
                  disabled={!row.isNew}
                  onChange={(e, { value }) => updateGroupRow(idx, { name: value })}
                />
              </Table.Cell>
              <Table.Cell>
                <Input
                  type='number'
                  min='0'
                  step='0.01'
                  value={row.ratio}
                  style={{ width: 120 }}
                  onChange={(e, { value }) => updateGroupRow(idx, { ratio: value })}
                />
              </Table.Cell>
              <Table.Cell>
                <Button
                  size='mini'
                  color='red'
                  disabled={row.name === 'default'}
                  onClick={() => removeGroupRow(idx)}
                >
                  {t('setting.operation.group_ratio.btn_delete')}
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <Form.Group inline style={{ marginTop: 8 }}>
        <Button
          size='small'
          onClick={() =>
            setGroupRows((rows) => [
              ...rows,
              { name: '', ratio: '1', isNew: true },
            ])
          }
        >
          {t('setting.operation.group_ratio.btn_add')}
        </Button>
        <Button size='small' primary loading={groupSaving} onClick={saveGroups}>
          {t('setting.operation.group_ratio.btn_save')}
        </Button>
      </Form.Group>

      {/* dry_run 变更预览 → 确认执行 */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size='large'
      >
        <Modal.Header>
          {t('setting.operation.ratio_auto.preview_title')}
        </Modal.Header>
        <Modal.Content scrolling>
          <p>
            {t('setting.operation.ratio_auto.preview_summary', {
              count: changes.length,
            })}
            {changes.length > PREVIEW_LIMIT &&
              ' ' + t('setting.operation.ratio_auto.preview_truncated', { limit: PREVIEW_LIMIT })}
          </p>
          {changes.length === 0 ? (
            <p>{t('setting.operation.ratio_auto.no_change')}</p>
          ) : (
            <Table compact size='small'>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t('setting.operation.ratio_auto.col_model_id')}
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    {t('setting.operation.ratio_auto.col_price_input')}
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    {t('setting.operation.ratio_auto.col_price_output')}
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    {t('setting.operation.ratio_auto.col_model_ratio')}
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    {t('setting.operation.ratio_auto.col_completion_ratio')}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {changes.slice(0, PREVIEW_LIMIT).map((c) => (
                  <Table.Row key={c.model_id}>
                    <Table.Cell style={{ wordBreak: 'break-all' }}>
                      {c.model_id}
                    </Table.Cell>
                    <Table.Cell>{c.price_input}</Table.Cell>
                    <Table.Cell>{c.price_output}</Table.Cell>
                    <Table.Cell>
                      {renderRatioDelta(c.old_model_ratio, c.new_model_ratio)}
                    </Table.Cell>
                    <Table.Cell>
                      {c.new_completion_ratio === null ||
                      c.new_completion_ratio === undefined
                        ? '—'
                        : renderRatioDelta(
                            c.old_completion_ratio,
                            c.new_completion_ratio
                          )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setPreviewOpen(false)}>
            {t('setting.operation.ratio_auto.btn_cancel')}
          </Button>
          <Button
            primary
            loading={applying}
            disabled={changes.length === 0}
            onClick={() => {
              applyRecompute().then();
            }}
          >
            {t('setting.operation.ratio_auto.btn_apply')}
          </Button>
        </Modal.Actions>
      </Modal>

      {/* 新增/编辑锁定 */}
      <Modal open={lockOpen} onClose={() => setLockOpen(false)} size='small'>
        <Modal.Header>{t('setting.operation.ratio_auto.lock_form.title')}</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Field>
              <label>{t('setting.operation.ratio_auto.lock_form.model_id')}</label>
              <Input
                value={lockForm.model_id}
                disabled={!!locks.find((l) => l.model_id === lockForm.model_id)}
                onChange={(e, { value }) =>
                  setLockForm((f) => ({ ...f, model_id: value }))
                }
                placeholder='deepseek/deepseek-v3.1'
              />
            </Form.Field>
            <Form.Field>
              <label>{t('setting.operation.ratio_auto.lock_form.model_ratio')}</label>
              <Input
                type='number'
                min='0'
                step='0.0001'
                value={lockForm.model_ratio}
                onChange={(e, { value }) =>
                  setLockForm((f) => ({ ...f, model_ratio: value }))
                }
                placeholder={t(
                  'setting.operation.ratio_auto.lock_form.keep_current'
                )}
              />
            </Form.Field>
            <Form.Field>
              <label>
                {t('setting.operation.ratio_auto.lock_form.completion_ratio')}
              </label>
              <Input
                type='number'
                min='0'
                step='0.01'
                value={lockForm.completion_ratio}
                onChange={(e, { value }) =>
                  setLockForm((f) => ({ ...f, completion_ratio: value }))
                }
                placeholder={t(
                  'setting.operation.ratio_auto.lock_form.keep_current'
                )}
              />
            </Form.Field>
            <Form.Field>
              <label>{t('setting.operation.ratio_auto.lock_form.note')}</label>
              <Input
                value={lockForm.note}
                onChange={(e, { value }) =>
                  setLockForm((f) => ({ ...f, note: value }))
                }
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setLockOpen(false)}>
            {t('setting.operation.ratio_auto.btn_cancel')}
          </Button>
          <Button primary loading={lockSaving} onClick={submitLock}>
            {t('setting.operation.ratio_auto.lock_form.btn_save')}
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default RatioAutoSetting;

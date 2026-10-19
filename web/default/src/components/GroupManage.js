import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Input, Label, Modal, Table } from 'semantic-ui-react';
import { API, showError, showSuccess } from '../helpers';

// Task4-11 用户组管理：组列表（分组倍率 + 成员数）、倍率编辑、批量迁移用户组
// 数据源：GET /api/group/manage（倍率来自 GroupRatio，成员数来自 users 表统计）
// 倍率保存沿用整体替换接口 POST /api/ratio/groups（default 必填）
const GroupManage = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]); // [{name, ratio, member_count}]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRatio, setNewRatio] = useState('1');
  // 批量迁移
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveFrom, setMoveFrom] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [moving, setMoving] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/group/manage');
      const { success, message, data } = res.data;
      if (success) {
        const sorted = [...(data || [])].sort((a, b) => {
          if (a.name === 'default') return -1;
          if (b.name === 'default') return 1;
          return a.name.localeCompare(b.name);
        });
        setRows(sorted);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGroups().then();
  }, []);

  const ratioChanged = (name, value) => {
    setRows((prev) =>
      prev.map((r) => (r.name === name ? { ...r, ratio: value } : r))
    );
  };

  const saveRatios = async () => {
    const groups = {};
    for (const r of rows) {
      const v = Number(r.ratio);
      if (Number.isNaN(v) || v < 0) {
        showError(t('groupmanage.invalid_ratio', { name: r.name }));
        return;
      }
      groups[r.name] = v;
    }
    if (!('default' in groups)) {
      showError(t('groupmanage.default_required'));
      return;
    }
    setSaving(true);
    try {
      const res = await API.post('/api/ratio/groups', { groups });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('groupmanage.saved'));
        await loadGroups();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setSaving(false);
  };

  const addGroup = () => {
    const name = newName.trim();
    if (!name) return;
    if (rows.some((r) => r.name === name)) {
      showError(t('groupmanage.duplicate', { name }));
      return;
    }
    const ratio = Number(newRatio);
    setRows((prev) => [
      ...prev,
      { name, ratio: Number.isNaN(ratio) || ratio < 0 ? 1 : ratio, member_count: 0 },
    ]);
    setNewName('');
    setNewRatio('1');
  };

  const removeGroup = (row) => {
    if (row.name === 'default') {
      showError(t('groupmanage.default_undeletable'));
      return;
    }
    if (row.member_count > 0) {
      showError(t('groupmanage.delete_has_members', { count: row.member_count }));
      return;
    }
    setRows((prev) => prev.filter((r) => r.name !== row.name));
  };

  const openMove = (name) => {
    setMoveFrom(name);
    setMoveTo('');
    setMoveOpen(true);
  };

  const doMove = async () => {
    if (!moveTo) {
      showError(t('groupmanage.move_target_required'));
      return;
    }
    setMoving(true);
    try {
      const res = await API.post('/api/group/move', {
        from_group: moveFrom,
        to_group: moveTo,
      });
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(t('groupmanage.moved', { count: data?.moved ?? 0 }));
        setMoveOpen(false);
        await loadGroups();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setMoving(false);
  };

  const moveTargets = rows.filter((r) => r.name !== moveFrom);

  return (
    <div>
      {/* 顶部：新增分组 + 保存倍率 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <Input
          size='small'
          placeholder={t('groupmanage.new_name')}
          value={newName}
          onChange={(e, { value }) => setNewName(value)}
          style={{ width: 180 }}
        />
        <Input
          size='small'
          type='number'
          step='0.1'
          min='0'
          placeholder={t('groupmanage.new_ratio')}
          value={newRatio}
          onChange={(e, { value }) => setNewRatio(value)}
          style={{ width: 110 }}
        />
        <Button size='small' onClick={addGroup}>
          <Icon name='plus' />
          {t('groupmanage.add')}
        </Button>
        <div style={{ flex: 1 }} />
        <Button size='small' loading={loading} onClick={() => loadGroups()}>
          <Icon name='refresh' />
          {t('groupmanage.reload')}
        </Button>
        <Button size='small' primary loading={saving} onClick={saveRatios}>
          <Icon name='save' />
          {t('groupmanage.save')}
        </Button>
      </div>

      <Table compact size='small' striped>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('groupmanage.name')}</Table.HeaderCell>
            <Table.HeaderCell width={6}>
              {t('groupmanage.ratio')}
            </Table.HeaderCell>
            <Table.HeaderCell width={4}>
              {t('groupmanage.members')}
            </Table.HeaderCell>
            <Table.HeaderCell width={4}>
              {t('groupmanage.actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {loading ? (
            <Table.Row>
              <Table.Cell colSpan='4' textAlign='center' style={{ padding: 24 }}>
                <Icon name='spinner' loading /> {t('groupmanage.loading')}
              </Table.Cell>
            </Table.Row>
          ) : rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan='4' textAlign='center' style={{ padding: 24 }}>
                {t('groupmanage.no_data')}
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row) => (
              <Table.Row key={row.name}>
                <Table.Cell>
                  <Label
                    size='small'
                    color={row.name === 'default' ? 'black' : 'blue'}
                  >
                    {row.name}
                  </Label>
                </Table.Cell>
                <Table.Cell>
                  <Input
                    size='small'
                    type='number'
                    step='0.1'
                    min='0'
                    fluid
                    value={row.ratio}
                    onChange={(e, { value }) => ratioChanged(row.name, value)}
                  />
                </Table.Cell>
                <Table.Cell>
                  {row.member_count}
                  {row.name !== 'default' && row.member_count > 0 && (
                    <span
                      style={{ color: 'var(--text-secondary)', fontSize: 11 }}
                    >
                      {' '}
                      · {t('groupmanage.move_hint')}
                    </span>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Button
                    size='mini'
                    disabled={row.member_count === 0}
                    onClick={() => openMove(row.name)}
                  >
                    <Icon name='exchange' />
                    {t('groupmanage.move')}
                  </Button>
                  <Button
                    size='mini'
                    negative
                    basic
                    disabled={row.name === 'default'}
                    onClick={() => removeGroup(row)}
                  >
                    <Icon name='trash alternate' />
                    {t('groupmanage.delete')}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>

      {/* 批量迁移 Modal */}
      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} size='mini'>
        <Modal.Header>{t('groupmanage.move_title', { name: moveFrom })}</Modal.Header>
        <Modal.Content>
          <p>{t('groupmanage.move_confirm')}</p>
          <Button.Group fluid vertical>
            {moveTargets.map((r) => (
              <Button
                key={r.name}
                basic={moveTo !== r.name}
                primary={moveTo === r.name}
                onClick={() => setMoveTo(r.name)}
              >
                {r.name}
              </Button>
            ))}
          </Button.Group>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setMoveOpen(false)}>
            {t('groupmanage.cancel')}
          </Button>
          <Button primary loading={moving} disabled={!moveTo} onClick={doMove}>
            {t('groupmanage.move')}
          </Button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default GroupManage;

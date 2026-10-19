import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Dropdown,
  Form,
  Icon,
  Input,
  Label,
  Modal,
  Table,
} from 'semantic-ui-react';
import { API, showError, showSuccess } from '../helpers';

// Task4-11 套餐管理（/payment 页「套餐管理」Tab）
// 套餐 = 购买后开通指定用户组（vip/svip）的模版；购买走在线支付链路，回调自动开通
const PackageManage = () => {
  const { t } = useTranslation();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  // 编辑/新增 Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=新增
  const [form, setForm] = useState({
    name: '',
    group_name: '',
    price: '10',
    duration_days: '30',
    description: '',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/package/');
      const { success, message, data } = res.data;
      if (success) {
        setPackages(Array.isArray(data) ? data : []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setLoading(false);
  };

  const loadGroupOptions = async () => {
    try {
      const res = await API.get('/api/group/');
      const data = res.data.data || [];
      setGroupOptions(
        data.map((g) => ({ key: g, text: g, value: g }))
      );
    } catch (e) {
      // 静默：下拉仍可 allowAdditions 手输
    }
  };

  useEffect(() => {
    loadPackages().then();
    loadGroupOptions().then();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: '',
      group_name: '',
      price: '10',
      duration_days: '30',
      description: '',
      enabled: true,
    });
    setModalOpen(true);
  };

  const openEdit = (pkg) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      group_name: pkg.group_name,
      price: String(pkg.price),
      duration_days: String(pkg.duration_days),
      description: pkg.description || '',
      enabled: !!pkg.enabled,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      showError(t('packagemanage.name_required'));
      return;
    }
    if (!form.group_name) {
      showError(t('packagemanage.group_required'));
      return;
    }
    const price = Number(form.price);
    const durationDays = Number(form.duration_days);
    if (Number.isNaN(price) || price < 0) {
      showError(t('packagemanage.price_invalid'));
      return;
    }
    if (!Number.isInteger(durationDays) || durationDays < 0) {
      showError(t('packagemanage.duration_invalid'));
      return;
    }
    const payload = {
      name,
      group_name: form.group_name,
      price,
      duration_days: durationDays,
      description: form.description,
      enabled: form.enabled,
    };
    setSaving(true);
    try {
      const res = editing
        ? await API.put('/api/package/', { ...payload, id: editing.id })
        : await API.post('/api/package/', payload);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('packagemanage.saved'));
        setModalOpen(false);
        await loadPackages();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setSaving(false);
  };

  const doDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await API.delete(`/api/package/${deleting.id}`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('packagemanage.deleted'));
        setDeleteOpen(false);
        setDeleting(null);
        await loadPackages();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setSaving(false);
  };

  const renderDuration = (days) =>
    days === 0 ? t('packagemanage.permanent') : t('packagemanage.days', { days });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          {t('packagemanage.tip')}
        </span>
        <div style={{ flex: 1 }} />
        <Button size='small' primary onClick={openAdd}>
          <Icon name='plus' />
          {t('packagemanage.add')}
        </Button>
      </div>

      <Table compact size='small' striped>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>{t('packagemanage.col_name')}</Table.HeaderCell>
            <Table.HeaderCell>{t('packagemanage.col_group')}</Table.HeaderCell>
            <Table.HeaderCell width={2}>
              {t('packagemanage.col_price')}
            </Table.HeaderCell>
            <Table.HeaderCell width={3}>
              {t('packagemanage.col_duration')}
            </Table.HeaderCell>
            <Table.HeaderCell width={2}>
              {t('packagemanage.col_status')}
            </Table.HeaderCell>
            <Table.HeaderCell width={3}>
              {t('packagemanage.col_actions')}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {loading ? (
            <Table.Row>
              <Table.Cell colSpan='6' textAlign='center' style={{ padding: 24 }}>
                <Icon name='spinner' loading /> {t('packagemanage.loading')}
              </Table.Cell>
            </Table.Row>
          ) : packages.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan='6' textAlign='center' style={{ padding: 24 }}>
                {t('packagemanage.no_data')}
              </Table.Cell>
            </Table.Row>
          ) : (
            packages.map((pkg) => (
              <Table.Row key={pkg.id}>
                <Table.Cell style={{ wordBreak: 'break-all' }}>
                  {pkg.name}
                  {pkg.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {pkg.description}
                    </div>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Label size='small' color='blue'>
                    {pkg.group_name}
                  </Label>
                </Table.Cell>
                <Table.Cell>¥{Number(pkg.price).toFixed(2)}</Table.Cell>
                <Table.Cell>{renderDuration(pkg.duration_days)}</Table.Cell>
                <Table.Cell>
                  {pkg.enabled ? (
                    <Label size='mini' color='green'>
                      {t('packagemanage.enabled')}
                    </Label>
                  ) : (
                    <Label size='mini' color='grey'>
                      {t('packagemanage.disabled')}
                    </Label>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Button size='mini' onClick={() => openEdit(pkg)}>
                    {t('packagemanage.edit')}
                  </Button>
                  <Button
                    size='mini'
                    negative
                    basic
                    onClick={() => {
                      setDeleting(pkg);
                      setDeleteOpen(true);
                    }}
                  >
                    {t('packagemanage.delete')}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>

      {/* 新增/编辑 Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size='small'>
        <Modal.Header>
          {editing
            ? t('packagemanage.edit_title', { name: editing.name })
            : t('packagemanage.add_title')}
        </Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Field>
              <label>{t('packagemanage.col_name')}</label>
              <Form.Input
                placeholder={t('packagemanage.name_placeholder')}
                value={form.name}
                onChange={(e, { value }) => setForm({ ...form, name: value })}
              />
            </Form.Field>
            <Form.Field>
              <label>{t('packagemanage.col_group')}</label>
              <Form.Dropdown
                placeholder={t('packagemanage.group_placeholder')}
                fluid
                selection
                search
                allowAdditions
                additionLabel={t('packagemanage.group_addition')}
                options={groupOptions}
                value={form.group_name}
                onChange={(e, { value }) => setForm({ ...form, group_name: value })}
              />
            </Form.Field>
            <Form.Group widths='equal'>
              <Form.Field>
                <label>{t('packagemanage.col_price')}</label>
                <Form.Input
                  type='number'
                  step='0.01'
                  min='0'
                  value={form.price}
                  onChange={(e, { value }) => setForm({ ...form, price: value })}
                />
              </Form.Field>
              <Form.Field>
                <label>{t('packagemanage.duration_label')}</label>
                <Form.Input
                  type='number'
                  step='1'
                  min='0'
                  value={form.duration_days}
                  onChange={(e, { value }) =>
                    setForm({ ...form, duration_days: value })
                  }
                />
              </Form.Field>
            </Form.Group>
            <Form.Field>
              <label>{t('packagemanage.col_desc')}</label>
              <Form.Input
                placeholder={t('packagemanage.desc_placeholder')}
                value={form.description}
                onChange={(e, { value }) =>
                  setForm({ ...form, description: value })
                }
              />
            </Form.Field>
            <Form.Field>
              <Checkbox
                toggle
                label={t('packagemanage.enabled_label')}
                checked={form.enabled}
                onChange={(e, { checked }) => setForm({ ...form, enabled: checked })}
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setModalOpen(false)}>
            {t('packagemanage.cancel')}
          </Button>
          <Button primary loading={saving} onClick={submit}>
            {t('packagemanage.save')}
          </Button>
        </Modal.Actions>
      </Modal>

      {/* 删除确认 Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} size='mini'>
        <Modal.Header>{t('packagemanage.delete_title')}</Modal.Header>
        <Modal.Content>
          <p>
            {deleting
              ? t('packagemanage.delete_confirm', { name: deleting.name })
              : ''}
          </p>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setDeleteOpen(false)}>
            {t('packagemanage.cancel')}
          </Button>
          <Button negative loading={saving} onClick={doDelete}>
            {t('packagemanage.delete')}
          </Button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default PackageManage;

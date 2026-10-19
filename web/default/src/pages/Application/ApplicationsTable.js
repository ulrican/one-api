// Task4-6 应用管理表格：底层与令牌同源（/api/application/ → tokens 表 app_type 非空）。
// 新建/编辑均为行内 Modal（无独立工具栏路由）；APIKey 列表脱敏仅可复制，
// 新建成功后弹出"仅展示一次"的 Key 结果窗（关闭即从 state 清除）。
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EmptyState from '../../components/EmptyState';
import {
  Button,
  Dropdown,
  Form,
  Header,
  Icon,
  Label,
  Modal,
  Pagination,
  Popup,
  Table,
} from 'semantic-ui-react';
import {
  API,
  copy,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { renderQuota } from '../../helpers/render';

const APP_TYPES = ['chat', 'agent', 'api', 'other'];
const APP_TYPE_COLORS = {
  chat: 'blue',
  agent: 'purple',
  api: 'teal',
  other: 'grey',
};

function maskKey(key) {
  if (!key) return '';
  // 脱敏：sk-****末4位，不支持直接查看
  return `sk-****${String(key).slice(-4)}`;
}

function renderStatus(status, t) {
  switch (status) {
    case 1:
      return <Label basic color='green'>{t('application.status_enabled')}</Label>;
    case 2:
      return <Label basic color='red'>{t('application.status_disabled')}</Label>;
    case 3:
      return <Label basic color='yellow'>{t('application.status_expired')}</Label>;
    case 4:
      return <Label basic color='grey'>{t('application.status_depleted')}</Label>;
    default:
      return <Label basic color='black'>{t('application.status_unknown')}</Label>;
  }
}

const ApplicationsTable = () => {
  const { t } = useTranslation();

  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [orderBy, setOrderBy] = useState('');

  // 新建/编辑 Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null=新建
  const [submitting, setSubmitting] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [inputs, setInputs] = useState({
    name: '',
    app_type: 'chat',
    remain_quota: 500000,
    expired_time: -1,
    unlimited_quota: false,
    models: [],
  });

  // 新建成功后仅展示一次的 Key（关闭即清除）
  const [createdApp, setCreatedApp] = useState(null);

  const loadApps = async (startIdx) => {
    const res = await API.get(`/api/application/?p=${startIdx}&order=${orderBy}`);
    const { success, message, data } = res.data;
    if (success) {
      if (startIdx === 0) {
        setApps(data);
      } else {
        const next = [...apps];
        next.splice(startIdx * ITEMS_PER_PAGE, data.length, ...data);
        setApps(next);
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const loadAvailableModels = async () => {
    try {
      const res = await API.get(`/api/user/available_models`);
      const { success, data } = res.data || {};
      if (success && data) {
        setModelOptions(data.map((m) => ({ key: m, text: m, value: m })));
      }
    } catch (e) {
      // 模型加载失败不阻塞页面
    }
  };

  useEffect(() => {
    loadApps(0).catch((r) => showError(r));
    loadAvailableModels();
  }, [orderBy]);

  const refresh = async () => {
    setLoading(true);
    await loadApps(activePage - 1);
  };

  const onPaginationChange = (e, { activePage: page }) => {
    (async () => {
      if (page === Math.ceil(apps.length / ITEMS_PER_PAGE) + 1) {
        await loadApps(page - 1, orderBy);
      }
      setActivePage(page);
    })();
  };

  const searchApps = async () => {
    if (searchKeyword === '') {
      await loadApps(0);
      setActivePage(1);
      setOrderBy('');
      return;
    }
    setSearching(true);
    const res = await API.get(`/api/application/search?keyword=${searchKeyword}`);
    const { success, message, data } = res.data;
    if (success) {
      setApps(data);
      setActivePage(1);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  const sortBy = (key) => {
    if (apps.length === 0) return;
    const sorted = [...apps].sort((a, b) =>
      isNaN(a[key]) ? ('' + a[key]).localeCompare(b[key]) : a[key] - b[key]
    );
    if (sorted[0].id === apps[0].id) sorted.reverse();
    setApps(sorted);
  };

  const manageApp = async (id, action, idx) => {
    let res;
    if (action === 'delete') {
      res = await API.delete(`/api/application/${id}/`);
    } else {
      res = await API.put(`/api/application/?status_only=true`, {
        id,
        app_type: apps.find((a) => a.id === id)?.app_type || 'other',
        name: apps.find((a) => a.id === id)?.name || 'app',
        status: action === 'enable' ? 1 : 2,
      });
    }
    const { success, message, data } = res.data;
    if (success) {
      showSuccess(t('application.messages.operation_success'));
      const next = [...apps];
      const realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
      if (action === 'delete') {
        next[realIdx].deleted = true;
      } else {
        next[realIdx].status = data.status;
      }
      setApps(next);
    } else {
      showError(message);
    }
  };

  // ---------- 新建/编辑 Modal ----------
  const openCreate = () => {
    setEditingId(null);
    setInputs({
      name: '',
      app_type: 'chat',
      remain_quota: 500000,
      expired_time: -1,
      unlimited_quota: false,
      models: [],
    });
    setModalOpen(true);
  };

  const openEdit = (app) => {
    setEditingId(app.id);
    setInputs({
      name: app.name || '',
      app_type: app.app_type || 'other',
      remain_quota: app.remain_quota,
      expired_time:
        app.expired_time === -1 ? -1 : timestamp2string(app.expired_time),
      unlimited_quota: app.unlimited_quota,
      models: app.models ? String(app.models).split(',').filter(Boolean) : [],
    });
    setModalOpen(true);
  };

  const setExpiredTime = (month, day, hour, minute) => {
    let ts = Date.now() / 1000;
    let seconds = month * 30 * 86400 + day * 86400 + hour * 3600 + minute * 60;
    if (seconds === 0) {
      setInputs((v) => ({ ...v, expired_time: -1 }));
    } else {
      setInputs((v) => ({ ...v, expired_time: timestamp2string(ts + seconds) }));
    }
  };

  const submit = async () => {
    if (inputs.name === '') {
      showError(t('application.messages.name_required'));
      return;
    }
    const payload = {
      ...inputs,
      remain_quota: parseInt(inputs.remain_quota) || 0,
      models: Array.isArray(inputs.models) ? inputs.models.join(',') : '',
    };
    if (payload.expired_time !== -1) {
      const time = Date.parse(payload.expired_time);
      if (isNaN(time)) {
        showError(t('application.messages.expire_invalid'));
        return;
      }
      payload.expired_time = Math.ceil(time / 1000);
    }
    setSubmitting(true);
    try {
      const res = editingId
        ? await API.put('/api/application/', { ...payload, id: editingId })
        : await API.post('/api/application/', payload);
      const { success, message, data } = res.data;
      if (success) {
        setModalOpen(false);
        if (editingId) {
          showSuccess(t('application.messages.update_success'));
        } else {
          // 新建：Key 仅展示这一次
          setCreatedApp(data);
        }
        await refresh();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setSubmitting(false);
  };

  const renderModels = (app) => {
    const models = app.models
      ? String(app.models).split(',').map((m) => m.trim()).filter(Boolean)
      : [];
    if (models.length === 0) {
      return <Label basic color='grey' size='tiny'>{t('application.all_models')}</Label>;
    }
    return (
      <Popup
        trigger={<Label basic color='blue' size='tiny' style={{ cursor: 'pointer' }}>{models.length}</Label>}
        on='hover'
        flowing
        hoverable
      >
        <div style={{ maxWidth: 320, wordBreak: 'break-all' }}>
          {models.join(', ')}
        </div>
      </Popup>
    );
  };

  const typeOptions = APP_TYPES.map((tp) => ({
    key: tp,
    text: t(`application.types.${tp}`),
    value: tp,
  }));

  return (
    <>
      <Form onSubmit={searchApps}>
        <Form.Input
          icon='search'
          fluid
          iconPosition='left'
          placeholder={t('application.search')}
          value={searchKeyword}
          loading={searching}
          onChange={(e, { value }) => setSearchKeyword(value.trim())}
        />
      </Form>

      <Table basic={'very'} compact size='small' className='app-table'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell style={{ cursor: 'pointer' }} onClick={() => sortBy('name')}>
              {t('application.col_name')}
            </Table.HeaderCell>
            <Table.HeaderCell>{t('application.col_type')}</Table.HeaderCell>
            <Table.HeaderCell>{t('application.col_apikey')}</Table.HeaderCell>
            <Table.HeaderCell style={{ cursor: 'pointer' }} onClick={() => sortBy('used_quota')}>
              {t('application.col_used')}
            </Table.HeaderCell>
            <Table.HeaderCell>{t('application.col_remain')}</Table.HeaderCell>
            <Table.HeaderCell style={{ cursor: 'pointer' }} onClick={() => sortBy('created_time')}>
              {t('application.col_created')}
            </Table.HeaderCell>
            <Table.HeaderCell>{t('application.col_expired')}</Table.HeaderCell>
            <Table.HeaderCell>{t('application.col_models')}</Table.HeaderCell>
            <Table.HeaderCell style={{ cursor: 'pointer' }} onClick={() => sortBy('status')}>
              {t('application.col_status')}
            </Table.HeaderCell>
            <Table.HeaderCell>{t('application.col_actions')}</Table.HeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {!loading && apps.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan='10' textAlign='center'>
                <EmptyState
                  icon='cubes'
                  title={t('application.empty.title')}
                  description={t('application.empty.desc')}
                />
              </Table.Cell>
            </Table.Row>
          )}
          {apps
            .slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE)
            .map((app, idx) => {
              if (app.deleted) return <React.Fragment key={app.id} />;
              return (
                <Table.Row key={app.id}>
                  <Table.Cell>{app.name || t('application.no_name')}</Table.Cell>
                  <Table.Cell>
                    <Label size='tiny' color={APP_TYPE_COLORS[app.app_type] || 'grey'}>
                      {t(`application.types.${app.app_type || 'other'}`)}
                    </Label>
                  </Table.Cell>
                  <Table.Cell>
                    <span className='app-key-masked'>
                      <code>{maskKey(app.key)}</code>
                      <Popup
                        trigger={
                          <Icon
                            name='copy outline'
                            link
                            onClick={async () => {
                              if (await copy(`sk-${app.key}`)) {
                                showSuccess(t('application.messages.copy_success'));
                              }
                            }}
                          />
                        }
                        content={t('application.copy_key')}
                        position='top center'
                      />
                    </span>
                  </Table.Cell>
                  <Table.Cell>{renderQuota(app.used_quota, t)}</Table.Cell>
                  <Table.Cell>
                    {app.unlimited_quota
                      ? t('application.unlimited')
                      : renderQuota(app.remain_quota, t, 2)}
                  </Table.Cell>
                  <Table.Cell>{timestamp2string(app.created_time)}</Table.Cell>
                  <Table.Cell>
                    {app.expired_time === -1
                      ? t('application.never_expire')
                      : timestamp2string(app.expired_time)}
                  </Table.Cell>
                  <Table.Cell>{renderModels(app)}</Table.Cell>
                  <Table.Cell>{renderStatus(app.status, t)}</Table.Cell>
                  <Table.Cell>
                    <Button size='mini' primary onClick={() => openEdit(app)}>
                      {t('application.buttons.edit')}
                    </Button>
                    <Button
                      size='mini'
                      onClick={() => manageApp(app.id, app.status === 1 ? 'disable' : 'enable', idx)}
                    >
                      {app.status === 1 ? t('application.buttons.disable') : t('application.buttons.enable')}
                    </Button>
                    <Popup
                      trigger={<Button size='mini' negative>{t('application.buttons.delete')}</Button>}
                      on='click'
                      flowing
                      hoverable
                    >
                      <Button size='tiny' negative onClick={() => manageApp(app.id, 'delete', idx)}>
                        {t('application.buttons.confirm_delete')}
                      </Button>
                    </Popup>
                  </Table.Cell>
                </Table.Row>
              );
            })}
        </Table.Body>

        <Table.Footer>
          <Table.Row>
            <Table.HeaderCell colSpan='10'>
              <Button size='small' primary onClick={openCreate} loading={loading}>
                <Icon name='add' />
                {t('application.buttons.add')}
              </Button>
              <Button size='small' onClick={refresh} loading={loading}>
                {t('application.buttons.refresh')}
              </Button>
              <Dropdown
                placeholder={t('application.sort_placeholder')}
                selection
                options={[
                  { key: '', text: t('application.sort_default'), value: '' },
                  { key: 'remain_quota', text: t('application.sort_remain'), value: 'remain_quota' },
                  { key: 'used_quota', text: t('application.sort_used'), value: 'used_quota' },
                ]}
                value={orderBy}
                onChange={(e, { value }) => {
                  setOrderBy(value);
                  setActivePage(1);
                }}
                style={{ marginLeft: 10 }}
              />
              <Pagination
                floated='right'
                activePage={activePage}
                onPageChange={onPaginationChange}
                size='small'
                siblingRange={1}
                totalPages={
                  Math.ceil(apps.length / ITEMS_PER_PAGE) +
                  (apps.length % ITEMS_PER_PAGE === 0 ? 1 : 0)
                }
              />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Footer>
      </Table>

      {/* 新建/编辑 Modal（行内入口，无独立路由） */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size='small'>
        <Modal.Header>
          {editingId ? t('application.modal.title_edit') : t('application.modal.title_create')}
        </Modal.Header>
        <Modal.Content>
          <Form autoComplete='off'>
            <Form.Field required>
              <label>{t('application.form.name')}</label>
              <Form.Input
                name='name'
                placeholder={t('application.form.name_placeholder')}
                value={inputs.name}
                maxLength={30}
                onChange={(e, { value }) => setInputs((v) => ({ ...v, name: value }))}
              />
            </Form.Field>
            <Form.Field required>
              <label>{t('application.form.type')}</label>
              <Dropdown
                placeholder={t('application.form.type')}
                fluid
                selection
                options={typeOptions}
                value={inputs.app_type}
                onChange={(e, { value }) => setInputs((v) => ({ ...v, app_type: value }))}
              />
            </Form.Field>
            <Form.Field>
              <label>{t('application.form.models')}</label>
              <Dropdown
                placeholder={t('application.form.models_placeholder')}
                fluid
                multiple
                search
                selection
                options={modelOptions}
                value={inputs.models}
                onChange={(e, { value }) => setInputs((v) => ({ ...v, models: value }))}
              />
            </Form.Field>
            <Form.Field>
              <label>{t('application.form.expire')}</label>
              <Form.Input
                name='expired_time'
                type='datetime-local'
                placeholder={t('application.form.expire_placeholder')}
                value={inputs.expired_time === -1 ? '' : inputs.expired_time}
                onChange={(e, { value }) =>
                  setInputs((v) => ({ ...v, expired_time: value === '' ? -1 : value }))
                }
              />
              <div className='app-expire-shortcuts'>
                <Button type='button' size='mini' onClick={() => setExpiredTime(0, 0, 0, 0)}>
                  {t('application.form.never_expire')}
                </Button>
                <Button type='button' size='mini' onClick={() => setExpiredTime(1, 0, 0, 0)}>
                  {t('application.form.expire_1_month')}
                </Button>
                <Button type='button' size='mini' onClick={() => setExpiredTime(0, 7, 0, 0)}>
                  {t('application.form.expire_7_days')}
                </Button>
                <Button type='button' size='mini' onClick={() => setExpiredTime(0, 1, 0, 0)}>
                  {t('application.form.expire_1_day')}
                </Button>
              </div>
            </Form.Field>
            <Form.Field>
              <label>
                {t('application.form.quota')}
                {inputs.unlimited_quota ? `（${t('application.unlimited')}）` : ''}
              </label>
              <Form.Input
                name='remain_quota'
                type='number'
                value={inputs.remain_quota}
                disabled={inputs.unlimited_quota}
                onChange={(e, { value }) => setInputs((v) => ({ ...v, remain_quota: value }))}
              />
              <Form.Checkbox
                checked={inputs.unlimited_quota}
                label={t('application.form.unlimited')}
                onChange={() => setInputs((v) => ({ ...v, unlimited_quota: !v.unlimited_quota }))}
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setModalOpen(false)}>{t('application.buttons.cancel')}</Button>
          <Button positive loading={submitting} onClick={submit}>
            {t('application.buttons.submit')}
          </Button>
        </Modal.Actions>
      </Modal>

      {/* 新建成功：APIKey 仅展示一次，关闭即清除 */}
      <Modal
        open={!!createdApp}
        onClose={() => setCreatedApp(null)}
        size='tiny'
      >
        <Header icon='check circle' color='green' content={t('application.created.title')} />
        <Modal.Content>
          <p>{t('application.created.notice')}</p>
          {createdApp && (
            <div className='app-created-key'>
              <strong>{createdApp.name}</strong>
              <p><code>sk-{createdApp.key}</code></p>
            </div>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button
            onClick={async () => {
              if (createdApp && (await copy(`sk-${createdApp.key}`))) {
                showSuccess(t('application.messages.copy_success'));
              }
            }}
          >
            <Icon name='copy' />
            {t('application.buttons.copy')}
          </Button>
          <Button positive onClick={() => setCreatedApp(null)}>
            {t('application.created.done')}
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default ApplicationsTable;

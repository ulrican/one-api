import React, { useEffect, useState } from 'react';
import {
  Button,
  Dropdown,
  Form,
  Header,
  Label,
  Pagination,
  Segment,
  Select,
  Table,
  Popup,
} from 'semantic-ui-react';
import {
  API,
  copy,
  isAdmin,
  showError,
  showSuccess,
  showWarning,
  timestamp2string,
} from '../helpers';
import { useTranslation } from 'react-i18next';
import EmptyState from './EmptyState';

import { ITEMS_PER_PAGE } from '../constants';
import { renderColorLabel, renderQuota } from '../helpers/render';
import { Link } from 'react-router-dom';

function renderTimestamp(timestamp, request_id) {
  return (
    <code
      onClick={async () => {
        if (await copy(request_id)) {
          showSuccess(`已复制请求 ID：${request_id}`);
        } else {
          showWarning(`请求 ID 复制失败：${request_id}`);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {timestamp2string(timestamp)}
    </code>
  );
}

const MODE_OPTIONS = [
  { key: 'all', text: '全部用户', value: 'all' },
  { key: 'self', text: '当前用户', value: 'self' },
];

function renderType(type) {
  switch (type) {
    case 1:
      return (
        <Label basic color='green'>
          充值
        </Label>
      );
    case 2:
      return (
        <Label basic color='olive'>
          消费
        </Label>
      );
    case 3:
      return (
        <Label basic color='orange'>
          管理
        </Label>
      );
    case 4:
      return (
        <Label basic color='purple'>
          系统
        </Label>
      );
    case 5:
      return (
        <Label basic color='violet'>
          测试
        </Label>
      );
    default:
      return (
        <Label basic color='black'>
          未知
        </Label>
      );
  }
}

function getColorByElapsedTime(elapsedTime) {
  if (elapsedTime === undefined || 0) return 'black';
  if (elapsedTime < 1000) return 'green';
  if (elapsedTime < 3000) return 'olive';
  if (elapsedTime < 5000) return 'yellow';
  if (elapsedTime < 10000) return 'orange';
  return 'red';
}

function renderDetail(log) {
  return (
    <>
      {log.content}
      <br />
      {log.elapsed_time && (
        <Label
          basic
          size={'mini'}
          color={getColorByElapsedTime(log.elapsed_time)}
        >
          {log.elapsed_time} ms
        </Label>
      )}
      {log.is_stream && (
        <>
          <Label size={'mini'} color='pink'>
            Stream
          </Label>
        </>
      )}
      {log.system_prompt_reset && (
        <>
          <Label basic size={'mini'} color='red'>
            System Prompt Reset
          </Label>
        </>
      )}
    </>
  );
}

// Task4-7 应用详情卡相关常量与辅助函数（与 ApplicationsTable 保持一致）
const APP_TYPE_COLORS = {
  chat: 'blue',
  agent: 'purple',
  api: 'teal',
  other: 'grey',
};

function maskKey(key) {
  if (!key) return '';
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

const LogsTable = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [showStat, setShowStat] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [logType, setLogType] = useState(0);
  const isAdminUser = isAdmin();
  // Task4-7 应用选择：应用列表与当前选中的应用对象（用于详情卡展示）
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  let now = new Date();
  const [inputs, setInputs] = useState({
    username: '',
    token_name: '',
    model_name: '',
    start_timestamp: timestamp2string(0),
    end_timestamp: timestamp2string(now.getTime() / 1000 + 3600),
    channel: '',
  });
  const {
    username,
    token_name,
    model_name,
    start_timestamp,
    end_timestamp,
    channel,
  } = inputs;

  const [stat, setStat] = useState({
    quota: 0,
    token: 0,
  });

  const LOG_OPTIONS = [
    { key: '0', text: t('log.type.all'), value: 0 },
    { key: '1', text: t('log.type.topup'), value: 1 },
    { key: '2', text: t('log.type.usage'), value: 2 },
    { key: '3', text: t('log.type.admin'), value: 3 },
    { key: '4', text: t('log.type.system'), value: 4 },
    { key: '5', text: t('log.type.test'), value: 5 },
  ];

  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  // Task4-7 加载当前用户全部应用（分页拉取，与 Playground 一致）
  const loadApplications = async () => {
    try {
      let all = [];
      for (let p = 0; p < 100; p++) {
        const res = await API.get(`/api/application/?p=${p}`);
        const { success, message, data } = res.data;
        if (!success) {
          showError(message);
          return;
        }
        all = all.concat(data);
        if (data.length < ITEMS_PER_PAGE) break;
      }
      setApplications(all);
    } catch (error) {
      showError(error.message);
    }
  };

  // 选中应用：用应用名作为 token_name 过滤（后端零改动），同时保存对象用于详情卡
  const handleAppChange = (e, { value }) => {
    if (!value) {
      setSelectedApp(null);
      setInputs((inputs) => ({ ...inputs, token_name: '' }));
      return;
    }
    const app = applications.find((a) => a.id === value);
    if (app) {
      setSelectedApp(app);
      setInputs((inputs) => ({ ...inputs, token_name: app.name }));
    }
  };

  const clearAppSelection = () => {
    setSelectedApp(null);
    setInputs((inputs) => ({ ...inputs, token_name: '' }));
  };

  const getLogSelfStat = async () => {
    let localStartTimestamp = Date.parse(start_timestamp) / 1000;
    let localEndTimestamp = Date.parse(end_timestamp) / 1000;
    let res = await API.get(
      `/api/log/self/stat?type=${logType}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}`
    );
    const { success, message, data } = res.data;
    if (success) {
      setStat(data);
    } else {
      showError(message);
    }
  };

  const getLogStat = async () => {
    let localStartTimestamp = Date.parse(start_timestamp) / 1000;
    let localEndTimestamp = Date.parse(end_timestamp) / 1000;
    let res = await API.get(
      `/api/log/stat?type=${logType}&username=${username}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&channel=${channel}`
    );
    const { success, message, data } = res.data;
    if (success) {
      setStat(data);
    } else {
      showError(message);
    }
  };

  const handleEyeClick = async () => {
    if (!showStat) {
      if (isAdminUser) {
        await getLogStat();
      } else {
        await getLogSelfStat();
      }
    }
    setShowStat(!showStat);
  };

  const showUserTokenQuota = () => {
    return logType !== 5;
  };

  const loadLogs = async (startIdx) => {
    let url = '';
    let localStartTimestamp = Date.parse(start_timestamp) / 1000;
    let localEndTimestamp = Date.parse(end_timestamp) / 1000;
    if (isAdminUser) {
      url = `/api/log/?p=${startIdx}&type=${logType}&username=${username}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}&channel=${channel}`;
    } else {
      url = `/api/log/self/?p=${startIdx}&type=${logType}&token_name=${token_name}&model_name=${model_name}&start_timestamp=${localStartTimestamp}&end_timestamp=${localEndTimestamp}`;
    }
    const res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      if (startIdx === 0) {
        setLogs(data);
      } else {
        let newLogs = [...logs];
        newLogs.splice(startIdx * ITEMS_PER_PAGE, data.length, ...data);
        setLogs(newLogs);
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const onPaginationChange = (e, { activePage }) => {
    (async () => {
      if (activePage === Math.ceil(logs.length / ITEMS_PER_PAGE) + 1) {
        // In this case we have to load more data and then append them.
        await loadLogs(activePage - 1);
      }
      setActivePage(activePage);
    })();
  };

  const refresh = async () => {
    setLoading(true);
    setActivePage(1);
    await loadLogs(0);
  };

  useEffect(() => {
    refresh().then();
  }, [logType]);

  useEffect(() => {
    loadApplications();
  }, []);

  const searchLogs = async () => {
    if (searchKeyword === '') {
      // if keyword is blank, load files instead.
      await loadLogs(0);
      setActivePage(1);
      return;
    }
    setSearching(true);
    const res = await API.get(`/api/log/self/search?keyword=${searchKeyword}`);
    const { success, message, data } = res.data;
    if (success) {
      setLogs(data);
      setActivePage(1);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  const handleKeywordChange = async (e, { value }) => {
    setSearchKeyword(value.trim());
  };

  const sortLog = (key) => {
    if (logs.length === 0) return;
    setLoading(true);
    let sortedLogs = [...logs];
    if (typeof sortedLogs[0][key] === 'string') {
      sortedLogs.sort((a, b) => {
        return ('' + a[key]).localeCompare(b[key]);
      });
    } else {
      sortedLogs.sort((a, b) => {
        if (a[key] === b[key]) return 0;
        if (a[key] > b[key]) return -1;
        if (a[key] < b[key]) return 1;
      });
    }
    if (sortedLogs[0].id === logs[0].id) {
      sortedLogs.reverse();
    }
    setLogs(sortedLogs);
    setLoading(false);
  };

  return (
    <>
      <Header as='h3'>
        {t('log.usage_details')}（{t('log.total_quota')}：
        {showStat && renderQuota(stat.quota, t)}
        {!showStat && (
          <span
            onClick={handleEyeClick}
            style={{ cursor: 'pointer', color: 'var(--text-tertiary)' }}
          >
            {t('log.click_to_view')}
          </span>
        )}
        ）
      </Header>
      <Form>
        <Form.Group>
          <Form.Select
            fluid
            label={t('log.table.application')}
            size={'small'}
            width={3}
            placeholder={t('log.table.application_placeholder')}
            name='application'
            value={selectedApp ? selectedApp.id : ''}
            options={applications.map((app) => ({
              key: app.id,
              text: app.name || t('application.no_name'),
              value: app.id,
            }))}
            onChange={handleAppChange}
            clearable
            search
            selection
          />
          <Form.Input
            fluid
            label={t('log.table.model_name')}
            size={'small'}
            width={3}
            value={model_name}
            placeholder={t('log.table.model_name_placeholder')}
            name='model_name'
            onChange={handleInputChange}
          />
          <Form.Input
            fluid
            label={t('log.table.start_time')}
            size={'small'}
            width={4}
            value={start_timestamp}
            type='datetime-local'
            name='start_timestamp'
            onChange={handleInputChange}
          />
          <Form.Input
            fluid
            label={t('log.table.end_time')}
            size={'small'}
            width={4}
            value={end_timestamp}
            type='datetime-local'
            name='end_timestamp'
            onChange={handleInputChange}
          />
          <Form.Button
            fluid
            label={t('log.buttons.query')}
            size={'small'}
            width={2}
            onClick={refresh}
          >
            {t('log.buttons.submit')}
          </Form.Button>
        </Form.Group>
        {isAdminUser && (
          <>
            <Form.Group>
              <Form.Input
                fluid
                label={t('log.table.channel_id')}
                size={'small'}
                width={3}
                value={channel}
                placeholder={t('log.table.channel_id_placeholder')}
                name='channel'
                onChange={handleInputChange}
              />
              <Form.Input
                fluid
                label={t('log.table.username')}
                size={'small'}
                width={3}
                value={username}
                placeholder={t('log.table.username_placeholder')}
                name='username'
                onChange={handleInputChange}
              />
            </Form.Group>
          </>
        )}
        <Form.Input
          icon='search'
          placeholder={t('log.search')}
          value={searchKeyword}
          onChange={(e, { value }) => setSearchKeyword(value)}
        />
      </Form>

      {/* Task4-7 应用详情卡：选中应用后展示 APIKey、额度、过期时间等信息 */}
      {selectedApp && (
        <Segment
          padded
          style={{
            marginBottom: '12px',
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Header as='h4' style={{ margin: 0 }}>
                {selectedApp.name || t('application.no_name')}
              </Header>
              <Label basic color={APP_TYPE_COLORS[selectedApp.app_type] || 'grey'}>
                {t(`application.types.${selectedApp.app_type}`, {
                  defaultValue: selectedApp.app_type,
                })}
              </Label>
              {renderStatus(selectedApp.status, t)}
            </div>
            <Button size='mini' basic onClick={clearAppSelection}>
              {t('log.buttons.clear_app')}
            </Button>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px 24px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {t('application.col_apikey')}：
              </span>
              <code style={{ marginRight: '6px' }}>
                {maskKey(selectedApp.key)}
              </code>
              <Button
                size='mini'
                basic
                icon='copy'
                onClick={async () => {
                  if (await copy(selectedApp.key)) {
                    showSuccess(t('application.messages.copy_success'));
                  }
                }}
              />
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {t('application.form.quota')}：
              </span>
              {selectedApp.unlimited_quota
                ? t('application.unlimited')
                : renderQuota(selectedApp.remain_quota, t)}
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {t('application.col_used')}：
              </span>
              {renderQuota(selectedApp.used_quota || 0, t)}
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {t('application.col_remain')}：
              </span>
              {selectedApp.unlimited_quota
                ? t('application.unlimited')
                : renderQuota(
                    Math.max(0, (selectedApp.remain_quota || 0) - (selectedApp.used_quota || 0)),
                    t
                  )}
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {t('application.col_expired')}：
              </span>
              {selectedApp.expired_time === -1
                ? t('application.never_expire')
                : timestamp2string(selectedApp.expired_time)}
            </div>
          </div>
        </Segment>
      )}

      <Table basic={'very'} compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell
              style={{ cursor: 'pointer' }}
              onClick={() => {
                sortLog('created_time');
              }}
              width={3}
            >
              {t('log.table.time')}
            </Table.HeaderCell>
            {isAdminUser && (
              <Table.HeaderCell
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  sortLog('channel');
                }}
                width={1}
              >
                {t('log.table.channel')}
              </Table.HeaderCell>
            )}
            <Table.HeaderCell
              style={{ cursor: 'pointer' }}
              onClick={() => {
                sortLog('type');
              }}
              width={1}
            >
              {t('log.table.type')}
            </Table.HeaderCell>
            <Table.HeaderCell
              style={{ cursor: 'pointer' }}
              onClick={() => {
                sortLog('model_name');
              }}
              width={2}
            >
              {t('log.table.model')}
            </Table.HeaderCell>
            {showUserTokenQuota() && (
              <>
                {isAdminUser && (
                  <Table.HeaderCell
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      sortLog('username');
                    }}
                    width={2}
                  >
                    {t('log.table.username')}
                  </Table.HeaderCell>
                )}
                <Table.HeaderCell
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    sortLog('token_name');
                  }}
                  width={2}
                >
                  {t('log.table.token_name')}
                </Table.HeaderCell>
                <Table.HeaderCell
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    sortLog('prompt_tokens');
                  }}
                  width={1}
                >
                  {t('log.table.prompt_tokens')}
                </Table.HeaderCell>
                <Table.HeaderCell
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    sortLog('completion_tokens');
                  }}
                  width={1}
                >
                  {t('log.table.completion_tokens')}
                </Table.HeaderCell>
                <Table.HeaderCell
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    sortLog('quota');
                  }}
                  width={1}
                >
                  {t('log.table.quota')}
                </Table.HeaderCell>
              </>
            )}
            <Table.HeaderCell>{t('log.table.detail')}</Table.HeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {!loading && logs.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan='11' textAlign='center'>
                <EmptyState
                  icon='file alternate outline'
                  title={t('log.empty.title')}
                  description={t('log.empty.desc')}
                />
              </Table.Cell>
            </Table.Row>
          )}
          {logs
            .slice(
              (activePage - 1) * ITEMS_PER_PAGE,
              activePage * ITEMS_PER_PAGE
            )
            .map((log, idx) => {
              if (log.deleted) return <></>;
              return (
                <Table.Row key={log.id}>
                  <Table.Cell>
                    {renderTimestamp(log.created_at, log.request_id)}
                  </Table.Cell>
                  {isAdminUser && (
                    <Table.Cell>
                      {log.channel ? (
                        <Label
                          basic
                          as={Link}
                          to={`/channel/edit/${log.channel}`}
                        >
                          {log.channel}
                        </Label>
                      ) : (
                        ''
                      )}
                    </Table.Cell>
                  )}
                  <Table.Cell>{renderType(log.type)}</Table.Cell>
                  <Table.Cell>
                    {log.model_name ? renderColorLabel(log.model_name) : ''}
                  </Table.Cell>
                  {showUserTokenQuota() && (
                    <>
                      {isAdminUser && (
                        <Table.Cell>
                          {log.username ? (
                            <Label
                              basic
                              as={Link}
                              to={`/user/edit/${log.user_id}`}
                            >
                              {log.username}
                            </Label>
                          ) : (
                            ''
                          )}
                        </Table.Cell>
                      )}
                      <Table.Cell>
                        {log.token_name ? renderColorLabel(log.token_name) : ''}
                      </Table.Cell>

                      <Table.Cell>
                        {log.prompt_tokens ? log.prompt_tokens : ''}
                      </Table.Cell>
                      <Table.Cell>
                        {log.completion_tokens ? log.completion_tokens : ''}
                      </Table.Cell>
                      <Table.Cell>
                        {log.quota ? renderQuota(log.quota, t, 6) : ''}
                      </Table.Cell>
                    </>
                  )}

                  <Table.Cell>{renderDetail(log)}</Table.Cell>
                </Table.Row>
              );
            })}
        </Table.Body>

        <Table.Footer>
          <Table.Row>
            <Table.HeaderCell colSpan={'10'}>
              <Select
                placeholder={t('log.type.select')}
                options={LOG_OPTIONS}
                style={{ marginRight: '8px' }}
                name='logType'
                value={logType}
                onChange={(e, { name, value }) => {
                  setLogType(value);
                }}
              />
              <Button size='small' onClick={refresh} loading={loading}>
                {t('log.buttons.refresh')}
              </Button>
              <Pagination
                floated='right'
                activePage={activePage}
                onPageChange={onPaginationChange}
                size='small'
                siblingRange={1}
                totalPages={
                  Math.ceil(logs.length / ITEMS_PER_PAGE) +
                  (logs.length % ITEMS_PER_PAGE === 0 ? 1 : 0)
                }
              />
            </Table.HeaderCell>
          </Table.Row>
        </Table.Footer>
      </Table>
    </>
  );
};

export default LogsTable;

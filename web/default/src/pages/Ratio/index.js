import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Icon,
  Input,
  Label,
  Modal,
  Popup,
  Table,
  Tab,
} from 'semantic-ui-react';
import { API, showError, showSuccess } from '../../helpers';
import RatioAutoSetting from '../../components/RatioAutoSetting';
import GroupManage from '../../components/GroupManage';
import './ratio.css';

// Task4-5 倍率管理三段式 Tab：
// Tab 1 自动计算倍率（只读表格 + 公式 Popup + 预览重算/立即执行）
// Tab 2 手动锁定倍率（复用 RatioAutoSetting 锁定表）
// Task4-11：Tab 3 改为用户组管理（GroupManage：分组倍率 + 成员数 + 批量迁移）

const PAGE_SIZE = 50;

const Ratio = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('auto');

  // ---------- Tab 1 自动计算倍率 ----------
  const [autoRows, setAutoRows] = useState([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoSearch, setAutoSearch] = useState('');
  const [autoPage, setAutoPage] = useState(1);

  const loadAutoList = async () => {
    setAutoLoading(true);
    try {
      const res = await API.get('/api/ratio/auto-list');
      const { success, message, data } = res.data;
      if (success) {
        setAutoRows(data || []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setAutoLoading(false);
  };

  useEffect(() => {
    loadAutoList().then();
  }, []);

  const filteredAutoRows = useMemo(() => {
    const s = autoSearch.trim().toLowerCase();
    if (!s) return autoRows;
    return autoRows.filter(
      (r) =>
        r.model_id.toLowerCase().includes(s) ||
        r.issuer.toLowerCase().includes(s) ||
        r.region.toLowerCase().includes(s)
    );
  }, [autoRows, autoSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredAutoRows.length / PAGE_SIZE));
  const pageRows = filteredAutoRows.slice(
    (autoPage - 1) * PAGE_SIZE,
    autoPage * PAGE_SIZE
  );

  const autoStats = useMemo(() => {
    const total = autoRows.length;
    const locked = autoRows.filter((r) => r.locked).length;
    return { total, locked, auto: total - locked };
  }, [autoRows]);

  // dry_run 预览重算 + 确认执行（Tab 1 独立实现，不复用 RatioAutoSetting）
  const [previewOpen, setPreviewOpen] = useState(false);
  const [changes, setChanges] = useState([]);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const previewRecompute = async () => {
    setPreviewing(true);
    try {
      const res = await API.post('/api/ratio/auto-recompute', { dry_run: true });
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
      const res = await API.post('/api/ratio/auto-recompute', { dry_run: false });
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(
          t('setting.operation.ratio_auto.applied', { count: data.count })
        );
        setPreviewOpen(false);
        await loadAutoList();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'request failed');
    }
    setApplying(false);
  };

  // ---------- Tab 2/3 锁定 + 分组：复用 RatioAutoSetting ----------
  // hideAutoRecompute=true 时它只渲染锁定表+分组表，不含自动计算区块

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

  // ---------- Tab 结构 ----------
  const tabs = [
    {
      menuItem: { key: 'auto', content: t('ratio.tabs.auto') },
      render: () => (
        <Tab.Pane attached={false}>
          {/* 顶部：统计 + 公式 Popup + 搜索 + 重算按钮 */}
          <div className='ratio-auto-toolbar'>
            <div className='ratio-auto-stats'>
              <span>
                <Icon name='cubes' /> {t('ratio.auto.stats.total')}: <strong>{autoStats.total}</strong>
              </span>
              <span>
                <Label circular size='mini' className='ratio-badge-auto'>
                  {t('ratio.auto.stats.auto')}: {autoStats.auto}
                </Label>
              </span>
              <span>
                <Label circular size='mini' className='ratio-badge-locked'>
                  {t('ratio.auto.stats.locked')}: {autoStats.locked}
                </Label>
              </span>
              {/* 公式说明：Popup on hover */}
              <Popup
                trigger={
                  <span className='ratio-formula-help'>
                    <Icon name='question circle outline' />
                    {t('ratio.auto.formula_label')}
                  </span>
                }
                on='hover'
                position='bottom right'
                wide
              >
                <div className='ratio-formula-pop'>
                  <div className='ratio-formula-pop-title'>
                    {t('ratio.auto.formula_title')}
                  </div>
                  <div className='ratio-formula-line'>
                    <code>modelRatio = priceInput(¥/百万) ÷ 14.0</code>
                  </div>
                  <div className='ratio-formula-line'>
                    <code>completionRatio = priceOutput ÷ priceInput</code>
                  </div>
                  <div className='ratio-formula-line'>
                    <code>quota = ceil((promptTokens + completionTokens × completionRatio) × modelRatio × groupRatio)</code>
                  </div>
                  <div className='ratio-formula-note'>
                    {t('ratio.auto.formula_note')}
                  </div>
                </div>
              </Popup>
            </div>
            <div className='ratio-auto-actions'>
              <Input
                icon='search'
                iconPosition='left'
                placeholder={t('ratio.auto.search_placeholder')}
                value={autoSearch}
                onChange={(e, { value }) => {
                  setAutoSearch(value);
                  setAutoPage(1);
                }}
                size='small'
                style={{ width: 240 }}
                clearable
              />
              <Button
                size='small'
                primary
                loading={previewing}
                onClick={() => previewRecompute()}
              >
                <Icon name='refresh' />
                {t('ratio.auto.preview_btn')}
              </Button>
            </div>
          </div>

          {/* 自动倍率表格 */}
          <Table compact size='small' striped selectable className='ratio-auto-table'>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>
                  {t('ratio.auto.col_model_id')}
                </Table.HeaderCell>
                <Table.HeaderCell width={80}>
                  {t('ratio.auto.col_issuer')}
                </Table.HeaderCell>
                <Table.HeaderCell width={70}>
                  {t('ratio.auto.col_region')}
                </Table.HeaderCell>
                <Table.HeaderCell width={90} collapsing>
                  {t('ratio.auto.col_price_input')}
                </Table.HeaderCell>
                <Table.HeaderCell width={90} collapsing>
                  {t('ratio.auto.col_price_output')}
                </Table.HeaderCell>
                <Table.HeaderCell width={110}>
                  {t('ratio.auto.col_model_ratio')}
                </Table.HeaderCell>
                <Table.HeaderCell width={120}>
                  {t('ratio.auto.col_completion_ratio')}
                </Table.HeaderCell>
                <Table.HeaderCell width={80}>
                  {t('ratio.auto.col_status')}
                </Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {autoLoading ? (
                <Table.Row>
                  <Table.Cell colSpan='8' textAlign='center' style={{ padding: 24, color: 'var(--text-secondary)' }}>
                    <Icon name='spinner' loading /> {t('ratio.auto.loading')}
                  </Table.Cell>
                </Table.Row>
              ) : filteredAutoRows.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan='8' textAlign='center' style={{ padding: 24, color: 'var(--text-secondary)' }}>
                    {autoSearch ? t('ratio.auto.no_search') : t('ratio.auto.no_data')}
                  </Table.Cell>
                </Table.Row>
              ) : (
                pageRows.map((row) => (
                  <Table.Row key={row.model_id} className={row.locked ? 'ratio-row-locked' : ''}>
                    <Table.Cell style={{ wordBreak: 'break-all' }}>{row.model_id}</Table.Cell>
                    <Table.Cell>{row.issuer || '—'}</Table.Cell>
                    <Table.Cell>{row.region || '—'}</Table.Cell>
                    <Table.Cell collapsing>{row.price_input > 0 ? row.price_input.toFixed(4) : '—'}</Table.Cell>
                    <Table.Cell collapsing>{row.price_output > 0 ? row.price_output.toFixed(4) : '—'}</Table.Cell>
                    <Table.Cell>
                      <span className='ratio-mr'>{row.model_ratio.toFixed(6)}</span>
                      {row.locked && <Icon name='lock' className='ratio-lock-icon' />}
                    </Table.Cell>
                    <Table.Cell>
                      {row.has_completion ? (
                        <span className='ratio-cr'>{row.completion_ratio.toFixed(6)}</span>
                      ) : (
                        '—'
                      )}
                      {row.locked && <Icon name='lock' className='ratio-lock-icon' />}
                    </Table.Cell>
                    <Table.Cell>
                      {row.locked ? (
                        <Label mini color='orange'>{t('ratio.auto.status_locked')}</Label>
                      ) : (
                        <Label mini color='teal'>{t('ratio.auto.status_auto')}</Label>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table>

          {/* 分页 */}
          {filteredAutoRows.length > PAGE_SIZE && (
            <div className='ratio-pagination'>
              <Button
                size='mini'
                disabled={autoPage <= 1}
                onClick={() => setAutoPage((p) => Math.max(1, p - 1))}
              >
                <Icon name='chevron left' />
              </Button>
              <span className='ratio-pagination-info'>
                {t('ratio.auto.pagination', { page: autoPage, total: totalPages })}
              </span>
              <Button
                size='mini'
                disabled={autoPage >= totalPages}
                onClick={() => setAutoPage((p) => Math.min(totalPages, p + 1))}
              >
                <Icon name='chevron right' />
              </Button>
            </div>
          )}
        </Tab.Pane>
      ),
    },
    {
      menuItem: { key: 'locks', content: t('ratio.tabs.locks') },
      render: () => (
        <Tab.Pane attached={false}>
          <RatioAutoSetting hideAutoRecompute showGroups={false} onRatioChanged={loadAutoList} />
        </Tab.Pane>
      ),
    },
    {
      menuItem: { key: 'groups', content: t('ratio.tabs.groups') },
      render: () => (
        <Tab.Pane attached={false}>
          <GroupManage />
        </Tab.Pane>
      ),
    },
  ];

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          {/* Task4-11：去除与侧栏菜单重复的页面标题，保留副标题说明 */}
          <div className='ratio-title-sub' style={{ marginBottom: 8 }}>
            {t('ratio.subheader')}
          </div>

          <Tab
            activeIndex={tabs.findIndex((t) => t.menuItem.key === activeTab)}
            onTabChange={(e, { activeIndex: idx }) => setActiveTab(tabs[idx].menuItem.key)}
            menu={{ borderless: true, attached: true, tabular: true }}
            panes={tabs}
          />
        </Card.Content>
      </Card>

      {/* dry_run 变更预览 Modal（Tab 1 独立） */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size='large'
      >
        <Modal.Header>
          {t('ratio.auto.preview_title')}
        </Modal.Header>
        <Modal.Content scrolling>
          <p>
            {t('ratio.auto.preview_summary', { count: changes.length })}
            {changes.length > 200 &&
              ' ' + t('ratio.auto.preview_truncated', { limit: 200 })}
          </p>
          {changes.length === 0 ? (
            <p>{t('ratio.auto.no_change')}</p>
          ) : (
            <Table compact size='small'>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t('ratio.auto.col_model_id')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('ratio.auto.col_price_input')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('ratio.auto.col_price_output')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('ratio.auto.col_model_ratio')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('ratio.auto.col_completion_ratio')}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {changes.slice(0, 200).map((c) => (
                  <Table.Row key={c.model_id}>
                    <Table.Cell style={{ wordBreak: 'break-all' }}>{c.model_id}</Table.Cell>
                    <Table.Cell>{c.price_input}</Table.Cell>
                    <Table.Cell>{c.price_output}</Table.Cell>
                    <Table.Cell>{renderRatioDelta(c.old_model_ratio, c.new_model_ratio)}</Table.Cell>
                    <Table.Cell>
                      {c.new_completion_ratio === null || c.new_completion_ratio === undefined
                        ? '—'
                        : renderRatioDelta(c.old_completion_ratio, c.new_completion_ratio)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setPreviewOpen(false)}>{t('ratio.auto.btn_cancel')}</Button>
          <Button
            primary
            loading={applying}
            disabled={changes.length === 0}
            onClick={() => applyRecompute()}
          >
            {t('ratio.auto.btn_apply')}
          </Button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default Ratio;

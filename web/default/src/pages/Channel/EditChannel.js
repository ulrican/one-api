import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Card, Checkbox, Form, Icon, Input, Label, Message, Segment, Table} from 'semantic-ui-react';
import {useNavigate, useParams} from 'react-router-dom';
import {API, copy, getChannelModels, showError, showInfo, showSuccess, verifyJSON,} from '../../helpers';
import {CHANNEL_OPTIONS, LIBRARY_CHANNEL_KEYS} from '../../constants';
import {renderChannelTip} from '../../helpers/render';

const MODEL_MAPPING_EXAMPLE = {
  'gpt-3.5-turbo-0301': 'gpt-3.5-turbo',
  'gpt-4-0314': 'gpt-4',
  'gpt-4-32k-0314': 'gpt-4-32k',
};

// 模型库模型选择面板：支持模糊搜索、按区域/厂商筛选、全选/取消全选。
// props:
//   models: 模型列表 [{model_id, name, issuer_name, region, ...}]
//   selected: 已选 model_id 数组
//   onChange(selectedIds): 选中变更回调
const LibraryModelPicker = ({ models, selected, onChange }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState({ keyword: '', region: 'all', issuer: '' });

  // 厂商选项：从 models 去重得到
  const issuerOptions = useMemo(() => {
    const set = new Set();
    models.forEach((m) => m.issuer_name && set.add(m.issuer_name));
    return Array.from(set).sort();
  }, [models]);

  // 前端本地过滤（数据量小，无需每次请求后端）
  const filtered = useMemo(() => {
    const kw = filter.keyword.trim().toLowerCase();
    return models.filter((m) => {
      if (filter.region !== 'all' && m.region !== filter.region) return false;
      if (filter.issuer && m.issuer_name !== filter.issuer) return false;
      if (kw) {
        const hay = `${m.name} ${m.model_id} ${m.issuer_name}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [models, filter]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selectedSet.has(m.model_id));

  // model_id -> 显示名（已选 chips 展示用；找不到回退 model_id）
  const modelNameMap = useMemo(() => {
    const map = new Map();
    models.forEach((m) => map.set(m.model_id, m.name || m.model_id));
    return map;
  }, [models]);

  const toggle = (modelId) => {
    if (selectedSet.has(modelId)) {
      onChange(selected.filter((id) => id !== modelId));
    } else {
      onChange([...selected, modelId]);
    }
  };

  const selectAllFiltered = () => {
    const merged = new Set(selected);
    filtered.forEach((m) => merged.add(m.model_id));
    onChange(Array.from(merged));
  };

  const unselectAllFiltered = () => {
    const remove = new Set(filtered.map((m) => m.model_id));
    onChange(selected.filter((id) => !remove.has(id)));
  };

  const regionLabel = (r) =>
    r === 'domestic'
      ? t('channel.edit.library.picker.region_domestic')
      : r === 'overseas'
        ? t('channel.edit.library.picker.region_overseas')
        : '';

  return (
    <Segment style={{ marginTop: 8 }}>
      {/* 筛选条 */}
      <Form.Group widths='equal' style={{ marginBottom: 8 }}>
        <Form.Input
          icon='search'
          placeholder={t('channel.edit.library.picker.search_placeholder')}
          value={filter.keyword}
          onChange={(e, { value }) =>
            setFilter((f) => ({ ...f, keyword: value }))
          }
        />
        <Form.Select
          placeholder={t('channel.edit.library.picker.region_all')}
          value={filter.region}
          options={[
            { key: 'all', text: t('channel.edit.library.picker.region_all'), value: 'all' },
            { key: 'domestic', text: t('channel.edit.library.picker.region_domestic'), value: 'domestic' },
            { key: 'overseas', text: t('channel.edit.library.picker.region_overseas'), value: 'overseas' },
          ]}
          onChange={(e, { value }) =>
            setFilter((f) => ({ ...f, region: value }))
          }
        />
        <Form.Select
          placeholder={t('channel.edit.library.picker.issuer_all')}
          search
          value={filter.issuer}
          options={[
            { key: '', text: t('channel.edit.library.picker.issuer_all'), value: '' },
            ...issuerOptions.map((iss) => ({
              key: iss,
              text: iss,
              value: iss,
            })),
          ]}
          onChange={(e, { value }) =>
            setFilter((f) => ({ ...f, issuer: value }))
          }
        />
      </Form.Group>

      {/* 已选模型 chips 区：按条件选中的模型在顶部集中展示，可单个移除 */}
      {selected.length > 0 && (
        <div
          style={{
            marginBottom: 8,
            padding: '6px 8px',
            background: 'var(--bg-muted, rgba(0,0,0,0.03))',
            border: '1px solid var(--border-color, #e8e8e8)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              maxHeight: 100,
              overflowY: 'auto',
            }}
          >
            <Label size='mini' style={{ margin: 0 }}>
              {t('channel.edit.library.picker.selected_chips')}
            </Label>
            {selected.map((id) => (
              <Label key={id} size='small' color='purple'>
                {modelNameMap.get(id) || id}
                <Icon
                  name='close'
                  style={{ marginLeft: 4, cursor: 'pointer' }}
                  onClick={() =>
                    onChange(selected.filter((sid) => sid !== id))
                  }
                />
              </Label>
            ))}
          </div>
        </div>
      )}

      {/* 操作栏：全选/取消全选 + 计数 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          <Button
            size='mini'
            onClick={selectAllFiltered}
            disabled={filtered.length === 0}
          >
            {t('channel.edit.library.picker.select_all_filtered', {
              count: filtered.length,
            })}
          </Button>
          <Button
            size='mini'
            onClick={unselectAllFiltered}
            disabled={filtered.length === 0}
          >
            {t('channel.edit.library.picker.unselect_all')}
          </Button>
        </div>
        <Label>
          {t('channel.edit.library.picker.selected_count')}{' '}
          <Label.Detail>{selected.length}</Label.Detail> /{' '}
          {t('channel.edit.library.picker.total_count', { count: models.length })}
        </Label>
      </div>

      {/* 模型列表（可滚动，避免长列表撑高页面） */}
      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid var(--border-color, #e8e8e8)',
          borderRadius: 4,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('channel.edit.library.picker.no_match')}
          </div>
        ) : (
          <Table compact size='small' unstackable striped>
            <Table.Header style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <Table.Row>
                <Table.HeaderCell style={{ width: 40 }}>
                  <Checkbox
                    checked={allFilteredSelected}
                    indeterminate={
                      !allFilteredSelected &&
                      filtered.some((m) => selectedSet.has(m.model_id))
                    }
                    onChange={() =>
                      allFilteredSelected
                        ? unselectAllFiltered()
                        : selectAllFiltered()
                    }
                  />
                </Table.HeaderCell>
                <Table.HeaderCell>{t('channel.edit.library.picker.col_model')}</Table.HeaderCell>
                <Table.HeaderCell>{t('channel.edit.library.picker.col_issuer')}</Table.HeaderCell>
                <Table.HeaderCell>{t('channel.edit.library.picker.col_region')}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filtered.map((m) => (
                <Table.Row
                  key={m.model_id}
                  active={selectedSet.has(m.model_id)}
                  onClick={() => toggle(m.model_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Cell>
                    <Checkbox
                      checked={selectedSet.has(m.model_id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggle(m.model_id);
                      }}
                    />
                  </Table.Cell>
                  <Table.Cell style={{ wordBreak: 'break-all' }}>
                    <div>{m.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {m.model_id}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{m.issuer_name || '-'}</Table.Cell>
                  <Table.Cell>
                    {m.region ? (
                      <Label size='mini' color={m.region === 'domestic' ? 'blue' : 'teal'}>
                        {regionLabel(m.region)}
                      </Label>
                    ) : (
                      '-'
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>
    </Segment>
  );
};

function type2secretPrompt(type, t) {
  switch (type) {
    case 15:
      return t('channel.edit.key_prompts.zhipu');
    case 18:
      return t('channel.edit.key_prompts.spark');
    case 22:
      return t('channel.edit.key_prompts.fastgpt');
    case 23:
      return t('channel.edit.key_prompts.tencent');
    default:
      return t('channel.edit.key_prompts.default');
  }
}

const EditChannel = () => {
  const { t } = useTranslation();
  const params = useParams();
  const navigate = useNavigate();
  const channelId = params.id;
  const isEdit = channelId !== undefined;
  const [loading, setLoading] = useState(isEdit);
  const handleCancel = () => {
    navigate('/channel');
  };

  const originInputs = {
    name: '',
    tag: '',
    type: 1,
    key: '',
    base_url: '',
    other: '',
    model_mapping: '',
    system_prompt: '',
    models: [],
    groups: ['default'],
  };
  const [batch, setBatch] = useState(false);
  const [inputs, setInputs] = useState(originInputs);
  const [originModelOptions, setOriginModelOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [basicModels, setBasicModels] = useState([]);
  const [fullModels, setFullModels] = useState([]);
  const [customModel, setCustomModel] = useState('');
  const [config, setConfig] = useState({
    region: '',
    sk: '',
    ak: '',
    user_id: '',
    vertex_ai_project_id: '',
    vertex_ai_adc: '',
  });
  // Task4-2 渠道模型库（type=52 七牛 / type=53 其他）独立凭证 + 模型列表
  const [libraryConfig, setLibraryConfig] = useState({
    api_base_url: '',
    api_key: '',
    api_secret: '',
    last_sync_at: 0,
  });
  const [libraryModels, setLibraryModels] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
    if (name === 'type') {
      if (value === 52 || value === 53) {
        // 模型库类型：不调 getChannelModels 硬编码列表，改为从 library 接口拉取
        const sourceType = value === 53 ? 'other_library' : 'qiniu_library';
        fetchLibraryModels(sourceType);
        setBasicModels([]);
        // 清空旧的硬编码已选模型，避免此前默认/全量填充的清单残留在渠道 models 里
        setInputs((inputs) => ({ ...inputs, models: [] }));
      } else {
        let localModels = getChannelModels(value);
        if (inputs.models.length === 0) {
          setInputs((inputs) => ({ ...inputs, models: localModels }));
        }
        setBasicModels(localModels);
      }
    }
  };
  const handleLibraryConfigChange = (e, { name, value }) => {
    setLibraryConfig((cfg) => ({ ...cfg, [name]: value }));
  };
  const fetchLibraryModels = async (sourceType) => {
    try {
      const res = await API.get(
        `/api/channel/library/models?source_type=${sourceType || 'qiniu_library'}`
      );
      if (res.data.success) {
        const list = res.data.data || [];
        setLibraryModels(list);
        // 同时把模型塞进 modelOptions，让下拉框可选
        setModelOptions(
          list.map((m) => ({
            key: m.model_id,
            text: `${m.name} (${m.model_id})`,
            value: m.model_id,
          }))
        );
      } else {
        showError(res.data.message);
      }
    } catch (err) {
      showError(err.message);
    }
  };
  const fetchLibrarySource = async (channelId) => {
    try {
      const res = await API.get(
        `/api/channel/library/source?channel_id=${channelId}`
      );
      if (res.data.success && res.data.data) {
        setLibraryConfig({
          api_base_url: res.data.data.api_base_url || '',
          api_key: res.data.data.api_key || '',
          api_secret: res.data.data.api_secret || '',
          last_sync_at: res.data.data.last_sync_at || 0,
        });
      }
    } catch (err) {
      // 静默失败：未保存凭证不阻塞编辑
    }
  };
  const handleLibrarySync = async () => {
    if (!libraryConfig.api_secret) {
      showError(t('channel.edit.library.secret_required'));
      return;
    }
    setSyncing(true);
    try {
      const res = await API.post('/api/channel/library/sync', {
        channel_id: channelId ? parseInt(channelId) : 0,
        source_type: inputs.type === 53 ? 'other_library' : 'qiniu_library',
        api_base_url: libraryConfig.api_base_url,
        api_key: libraryConfig.api_key,
        api_secret: libraryConfig.api_secret,
      });
      if (res.data.success) {
        showSuccess(
          t('channel.edit.library.sync_success', {
            count: res.data.data.synced,
          })
        );
        // 重新拉取模型列表
        await fetchLibraryModels(inputs.type === 53 ? 'other_library' : 'qiniu_library');
        // 更新 last_sync_at
        setLibraryConfig((cfg) => ({ ...cfg, last_sync_at: Math.floor(Date.now() / 1000) }));
      } else {
        showError(res.data.message);
      }
    } catch (err) {
      showError(err.message);
    }
    setSyncing(false);
  };

  const handleConfigChange = (e, { name, value }) => {
    setConfig((inputs) => ({ ...inputs, [name]: value }));
  };

  const loadChannel = async () => {
    let res = await API.get(`/api/channel/${channelId}`);
    const { success, message, data } = res.data;
    if (success) {
      if (data.models === '') {
        data.models = [];
      } else {
        data.models = data.models.split(',');
      }
      if (data.group === '') {
        data.groups = [];
      } else {
        data.groups = data.group.split(',');
      }
      if (data.model_mapping !== '') {
        data.model_mapping = JSON.stringify(
          JSON.parse(data.model_mapping),
          null,
          2
        );
      }
      setInputs(data);
      if (data.config !== '') {
        setConfig(JSON.parse(data.config));
      }
      setBasicModels(getChannelModels(data.type));
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const fetchModels = async () => {
    try {
      let res = await API.get(`/api/channel/models`);
      let localModelOptions = res.data.data.map((model) => ({
        key: model.id,
        text: model.id,
        value: model.id,
      }));
      setOriginModelOptions(localModelOptions);
      setFullModels(res.data.data.map((model) => model.id));
    } catch (error) {
      showError(error.message);
    }
  };

  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      setGroupOptions(
        res.data.data.map((group) => ({
          key: group,
          text: group,
          value: group,
        }))
      );
    } catch (error) {
      showError(error.message);
    }
  };

  useEffect(() => {
    if (inputs.type === 52 || inputs.type === 53) {
      // Task4-2 模型库类型：modelOptions 由 fetchLibraryModels 设置，不在这里覆盖
      return;
    }
    let localModelOptions = [...originModelOptions];
    inputs.models.forEach((model) => {
      if (!localModelOptions.find((option) => option.key === model)) {
        localModelOptions.push({
          key: model,
          text: model,
          value: model,
        });
      }
    });
    setModelOptions(localModelOptions);
  }, [originModelOptions, inputs.models]);

  useEffect(() => {
    if (isEdit) {
      loadChannel().then();
    } else {
      let localModels = getChannelModels(inputs.type);
      setBasicModels(localModels);
    }
    fetchModels().then();
    fetchGroups().then();
  }, []);

  // Task4-2 编辑模型库渠道（type=52/53）时：加载已保存的凭证 + 模型列表
  useEffect(() => {
    if (!isEdit) return;
    if (inputs.type !== 52 && inputs.type !== 53) return;
    fetchLibrarySource(channelId).then();
    const sourceType = inputs.type === 53 ? 'other_library' : 'qiniu_library';
    fetchLibraryModels(sourceType).then();
  }, [inputs.type, channelId, isEdit]);

  const submit = async () => {
    // Task4-2 模型库渠道（type=52/53）：key 从 libraryConfig.api_secret 自动填充；
    // base_url 取库配置，七牛留空时默认官方网关（实际转发需要）
    if (inputs.type === 52 || inputs.type === 53) {
      if (libraryConfig.api_secret) {
        inputs.key = libraryConfig.api_secret;
      }
      const libBase =
        libraryConfig.api_base_url ||
        (inputs.type === 52 ? 'https://openai.qiniu.com' : '');
      if (libBase && !inputs.base_url) {
        inputs.base_url = libBase;
      }
    }
    if (inputs.key === '') {
      if (config.ak !== '' && config.sk !== '' && config.region !== '') {
        inputs.key = `${config.ak}|${config.sk}|${config.region}`;
      } else if (
        config.region !== '' &&
        config.vertex_ai_project_id !== '' &&
        config.vertex_ai_adc !== ''
      ) {
        inputs.key = `${config.region}|${config.vertex_ai_project_id}|${config.vertex_ai_adc}`;
      }
    }
    if (!isEdit && (inputs.name === '' || inputs.key === '')) {
      showInfo(t('channel.edit.messages.name_required'));
      return;
    }
    if (inputs.type !== 43 && inputs.models.length === 0) {
      showInfo(t('channel.edit.messages.models_required'));
      return;
    }
    if (inputs.model_mapping !== '' && !verifyJSON(inputs.model_mapping)) {
      showInfo(t('channel.edit.messages.model_mapping_invalid'));
      return;
    }
    let localInputs = { ...inputs };
    if (localInputs.key === 'undefined|undefined|undefined') {
      localInputs.key = ''; // prevent potential bug
    }
    if (localInputs.base_url && localInputs.base_url.endsWith('/')) {
      localInputs.base_url = localInputs.base_url.slice(
        0,
        localInputs.base_url.length - 1
      );
    }
    if (localInputs.type === 52 || localInputs.type === 53) {
      // Task4-2 模型库独立凭证 → channel_model_sources 扩展表（后端 AES 加密落库）
      localInputs.library_api_key = libraryConfig.api_key;
      localInputs.library_api_secret = libraryConfig.api_secret;
      localInputs.library_api_base_url = libraryConfig.api_base_url;
    }
    if (localInputs.type === 3 && localInputs.other === '') {
      localInputs.other = '2024-03-01-preview';
    }
    let res;
    localInputs.models = localInputs.models.join(',');
    localInputs.group = localInputs.groups.join(',');
    localInputs.config = JSON.stringify(config);
    if (isEdit) {
      res = await API.put(`/api/channel/`, {
        ...localInputs,
        id: parseInt(channelId),
      });
    } else {
      res = await API.post(`/api/channel/`, localInputs);
    }
    const { success, message } = res.data;
    if (success) {
      if (isEdit) {
        showSuccess(t('channel.edit.messages.update_success'));
      } else {
        showSuccess(t('channel.edit.messages.create_success'));
        setInputs(originInputs);
      }
    } else {
      showError(message);
    }
  };

  const addCustomModel = () => {
    if (customModel.trim() === '') return;
    if (inputs.models.includes(customModel)) return;
    let localModels = [...inputs.models];
    localModels.push(customModel);
    let localModelOptions = [];
    localModelOptions.push({
      key: customModel,
      text: customModel,
      value: customModel,
    });
    setModelOptions((modelOptions) => {
      return [...modelOptions, ...localModelOptions];
    });
    setCustomModel('');
    handleInputChange(null, { name: 'models', value: localModels });
  };

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>
            {isEdit
              ? t('channel.edit.title_edit')
              : t('channel.edit.title_create')}
          </Card.Header>
          <Form loading={loading} autoComplete='new-password'>
            <Form.Field>
              <Form.Select
                label={t('channel.edit.type')}
                name='type'
                required
                search
                // 屏蔽硬编码渠道类型：仅暴露模型库类型（52/53），数据源为市场同步
                options={CHANNEL_OPTIONS.filter((o) =>
                  LIBRARY_CHANNEL_KEYS.includes(o.key)
                )}
                value={inputs.type}
                onChange={handleInputChange}
              />
            </Form.Field>
            <Form.Field>
              <Form.Input
                label={t('channel.edit.name')}
                name='name'
                placeholder={t('channel.edit.name_placeholder')}
                onChange={handleInputChange}
                value={inputs.name}
                required
              />
            </Form.Field>
            <Form.Field>
              <Form.Input
                label={t('channel.edit.tag')}
                name='tag'
                placeholder={t('channel.edit.tag_placeholder')}
                onChange={handleInputChange}
                value={inputs.tag ?? ''}
                autoComplete='new-password'
              />
            </Form.Field>
            <Form.Field>
              <Form.Dropdown
                label={t('channel.edit.group')}
                placeholder={t('channel.edit.group_placeholder')}
                name='groups'
                required
                fluid
                multiple
                selection
                allowAdditions
                additionLabel={t('channel.edit.group_addition')}
                onChange={handleInputChange}
                value={inputs.groups}
                autoComplete='new-password'
                options={groupOptions}
              />
            </Form.Field>
            {renderChannelTip(inputs.type)}

            {/* Azure OpenAI specific fields */}
            {inputs.type === 3 && (
              <>
                <Message>
                  注意，<strong>模型部署名称必须和模型名称保持一致</strong>
                  ，因为 FluxAI 会把请求体中的 model
                  参数替换为你的部署名称（模型名称中的点会被剔除），
                  <a
                    target='_blank'
                    href='https://github.com/songquanpeng/one-api/issues/133?notification_referrer_id=NT_kwDOAmJSYrM2NjIwMzI3NDgyOjM5OTk4MDUw#issuecomment-1571602271'
                  >
                    图片演示
                  </a>
                  。
                </Message>
                <Form.Field>
                  <Form.Input
                    label='AZURE_OPENAI_ENDPOINT'
                    name='base_url'
                    placeholder='请输入 AZURE_OPENAI_ENDPOINT，例如：https://docs-test-001.openai.azure.com'
                    onChange={handleInputChange}
                    value={inputs.base_url}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.Input
                    label='默认 API 版本'
                    name='other'
                    placeholder='请输入默认 API 版本，例如：2024-03-01-preview，该配置可以被实际的请求查询参数所覆盖'
                    onChange={handleInputChange}
                    value={inputs.other}
                    autoComplete='new-password'
                  />
                </Form.Field>
              </>
            )}

            {/* Custom base URL field */}
            {inputs.type === 8 && (
              <Form.Field>
                <Form.Input
                    required
                    label={t('channel.edit.proxy_url')}
                    name='base_url'
                    placeholder={t('channel.edit.proxy_url_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.base_url}
                    autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 50 && (
                <Form.Field>
                  <Form.Input
                      required
                  label={t('channel.edit.base_url')}
                  name='base_url'
                  placeholder={t('channel.edit.base_url_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.base_url}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}

            {inputs.type === 18 && (
              <Form.Field>
                <Form.Input
                  label={t('channel.edit.spark_version')}
                  name='other'
                  placeholder={t('channel.edit.spark_version_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.other}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 21 && (
              <Form.Field>
                <Form.Input
                  label={t('channel.edit.knowledge_id')}
                  name='other'
                  placeholder={t('channel.edit.knowledge_id_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.other}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 17 && (
              <Form.Field>
                <Form.Input
                  label={t('channel.edit.plugin_param')}
                  name='other'
                  placeholder={t('channel.edit.plugin_param_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.other}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 34 && (
              <Message>{t('channel.edit.coze_notice')}</Message>
            )}
            {inputs.type === 40 && (
              <Message>
                {t('channel.edit.douban_notice')}
                <a
                  target='_blank'
                  href='https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint'
                >
                  {t('channel.edit.douban_notice_link')}
                </a>
                {t('channel.edit.douban_notice_2')}
              </Message>
            )}
            {inputs.type !== 43 &&
              (inputs.type === 52 || inputs.type === 53 ? (
                // 模型库类型：用自定义面板（搜索+筛选+全选/取消全选）替代下拉
                <Form.Field>
                  <label>{t('channel.edit.models')}</label>
                  <LibraryModelPicker
                    models={libraryModels}
                    selected={inputs.models}
                    onChange={(ids) =>
                      setInputs((prev) => ({ ...prev, models: ids }))
                    }
                  />
                </Form.Field>
              ) : (
                <Form.Field>
                  <Form.Dropdown
                    label={t('channel.edit.models')}
                    placeholder={t('channel.edit.models_placeholder')}
                    name='models'
                    required
                    fluid
                    multiple
                    search
                    onLabelClick={(e, { value }) => {
                      copy(value).then();
                    }}
                    selection
                    onChange={handleInputChange}
                    value={inputs.models}
                    autoComplete='new-password'
                    options={modelOptions}
                  />
                </Form.Field>
              ))}
            {inputs.type !== 43 && (
              <div style={{ lineHeight: '40px', marginBottom: '12px' }}>
                {/* 屏蔽硬编码模型灌入入口：模型库类型（52/53）下隐藏，
                    「填入相关/所有模型」的数据源为硬编码 adaptor 清单 */}
                {(inputs.type !== 52 && inputs.type !== 53) && (
                  <>
                    <Button
                      type={'button'}
                      onClick={() => {
                        handleInputChange(null, {
                          name: 'models',
                          value: basicModels,
                        });
                      }}
                    >
                      {t('channel.edit.buttons.fill_models')}
                    </Button>
                    <Button
                      type={'button'}
                      onClick={() => {
                        handleInputChange(null, {
                          name: 'models',
                          value: fullModels,
                        });
                      }}
                    >
                      {t('channel.edit.buttons.fill_all')}
                    </Button>
                  </>
                )}
                <Button
                  type={'button'}
                  onClick={() => {
                    handleInputChange(null, { name: 'models', value: [] });
                  }}
                >
                  {t('channel.edit.buttons.clear')}
                </Button>
                <Input
                  action={
                    <Button type={'button'} onClick={addCustomModel}>
                      {t('channel.edit.buttons.add_custom')}
                    </Button>
                  }
                  placeholder={t('channel.edit.buttons.custom_placeholder')}
                  value={customModel}
                  onChange={(e, { value }) => {
                    setCustomModel(value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addCustomModel();
                      e.preventDefault();
                    }
                  }}
                />
              </div>
            )}
            {inputs.type !== 43 && (
              <>
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.model_mapping')}
                    placeholder={`${t(
                      'channel.edit.model_mapping_placeholder'
                    )}\n${JSON.stringify(MODEL_MAPPING_EXAMPLE, null, 2)}`}
                    name='model_mapping'
                    onChange={handleInputChange}
                    value={inputs.model_mapping}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.system_prompt')}
                    placeholder={t('channel.edit.system_prompt_placeholder')}
                    name='system_prompt'
                    onChange={handleInputChange}
                    value={inputs.system_prompt}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
              </>
            )}
            {inputs.type === 33 && (
              <Form.Field>
                <Form.Input
                  label='Region'
                  name='region'
                  required
                  placeholder={t('channel.edit.aws_region_placeholder')}
                  onChange={handleConfigChange}
                  value={config.region}
                  autoComplete=''
                />
                <Form.Input
                  label='AK'
                  name='ak'
                  required
                  placeholder={t('channel.edit.aws_ak_placeholder')}
                  onChange={handleConfigChange}
                  value={config.ak}
                  autoComplete=''
                />
                <Form.Input
                  label='SK'
                  name='sk'
                  required
                  placeholder={t('channel.edit.aws_sk_placeholder')}
                  onChange={handleConfigChange}
                  value={config.sk}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {inputs.type === 42 && (
              <Form.Field>
                <Form.Input
                  label='Region'
                  name='region'
                  required
                  placeholder={t('channel.edit.vertex_region_placeholder')}
                  onChange={handleConfigChange}
                  value={config.region}
                  autoComplete=''
                />
                <Form.Input
                  label={t('channel.edit.vertex_project_id')}
                  name='vertex_ai_project_id'
                  required
                  placeholder={t('channel.edit.vertex_project_id_placeholder')}
                  onChange={handleConfigChange}
                  value={config.vertex_ai_project_id}
                  autoComplete=''
                />
                <Form.Input
                  label={t('channel.edit.vertex_credentials')}
                  name='vertex_ai_adc'
                  required
                  placeholder={t('channel.edit.vertex_credentials_placeholder')}
                  onChange={handleConfigChange}
                  value={config.vertex_ai_adc}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {inputs.type === 34 && (
              <Form.Input
                label={t('channel.edit.user_id')}
                name='user_id'
                required
                placeholder={t('channel.edit.user_id_placeholder')}
                onChange={handleConfigChange}
                value={config.user_id}
                autoComplete=''
              />
            )}
            {/* Task4-2 渠道模型库（七牛/其他）凭证 + 刷新模型列表 */}
            {(inputs.type === 52 || inputs.type === 53) && (
              <>
                <Message info>
                  {inputs.type === 52
                    ? t('channel.edit.library.notice_qiniu')
                    : t('channel.edit.library.notice_other')}
                  {libraryConfig.last_sync_at > 0 && (
                    <span style={{ marginLeft: '12px', color: '#888' }}>
                      {t('channel.edit.library.last_sync', {
                        time: new Date(
                          libraryConfig.last_sync_at * 1000
                        ).toLocaleString(),
                      })}
                    </span>
                  )}
                </Message>
                <Form.Field>
                  <Form.Input
                    label={t('channel.edit.library.base_url_label')}
                    name='api_base_url'
                    placeholder={t(
                      'channel.edit.library.base_url_placeholder'
                    )}
                    onChange={handleLibraryConfigChange}
                    value={libraryConfig.api_base_url}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.Input
                    label={t('channel.edit.library.api_key_label')}
                    name='api_key'
                    placeholder={t('channel.edit.library.api_key_placeholder')}
                    onChange={handleLibraryConfigChange}
                    value={libraryConfig.api_key}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.Input
                    label={t('channel.edit.library.api_secret_label')}
                    name='api_secret'
                    required
                    placeholder={t(
                      'channel.edit.library.api_secret_placeholder'
                    )}
                    onChange={handleLibraryConfigChange}
                    value={libraryConfig.api_secret}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <div style={{ marginBottom: '16px' }}>
                  <Button
                    type='button'
                    loading={syncing}
                    disabled={syncing || !libraryConfig.api_secret}
                    onClick={handleLibrarySync}
                    color='purple'
                  >
                    {t('channel.edit.library.refresh')}
                  </Button>
                  <span style={{ marginLeft: '12px', color: '#888' }}>
                    {libraryModels.length > 0
                      ? t('channel.edit.library.model_count', {
                          count: libraryModels.length,
                        })
                      : t('channel.edit.library.not_synced')}
                  </span>
                </div>
              </>
            )}
            {inputs.type !== 33 &&
              inputs.type !== 42 &&
              inputs.type !== 52 &&
              inputs.type !== 53 &&
              (batch ? (
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.key')}
                    name='key'
                    required
                    placeholder={t('channel.edit.batch_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.key}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
              ) : (
                <Form.Field>
                  <Form.Input
                    label={t('channel.edit.key')}
                    name='key'
                    required
                    placeholder={type2secretPrompt(inputs.type, t)}
                    onChange={handleInputChange}
                    value={inputs.key}
                    autoComplete='new-password'
                  />
                </Form.Field>
              ))}
            {inputs.type === 37 && (
              <Form.Field>
                <Form.Input
                  label='Account ID'
                  name='user_id'
                  required
                  placeholder={
                    '请输入 Account ID，例如：d8d7c61dbc334c32d3ced580e4bf42b4'
                  }
                  onChange={handleConfigChange}
                  value={config.user_id}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {inputs.type !== 33 && !isEdit && (
              <Form.Checkbox
                checked={batch}
                label={t('channel.edit.batch')}
                name='batch'
                onChange={() => setBatch(!batch)}
              />
            )}
            {inputs.type !== 3 &&
              inputs.type !== 33 &&
              inputs.type !== 8 &&
                inputs.type !== 50 &&
              inputs.type !== 22 &&
              inputs.type !== 52 &&
              inputs.type !== 53 && (
                <Form.Field>
                  <Form.Input
                      label={t('channel.edit.proxy_url')}
                    name='base_url'
                      placeholder={t('channel.edit.proxy_url_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.base_url}
                    autoComplete='new-password'
                  />
                </Form.Field>
              )}
            {inputs.type === 22 && (
              <Form.Field>
                <Form.Input
                  label='私有部署地址'
                  name='base_url'
                  placeholder={
                    '请输入私有部署地址，格式为：https://fastgpt.run/api/openapi'
                  }
                  onChange={handleInputChange}
                  value={inputs.base_url}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            <Button onClick={handleCancel}>
              {t('channel.edit.buttons.cancel')}
            </Button>
            <Button
              type={isEdit ? 'button' : 'submit'}
              positive
              onClick={submit}
            >
              {t('channel.edit.buttons.submit')}
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
};

export default EditChannel;

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown, Icon } from 'semantic-ui-react';
import { API, showError } from '../../helpers';
import EmptyState from '../../components/EmptyState';
import TextPanel from './TextPanel';
import ImagePanel from './ImagePanel';
import AudioPanel from './AudioPanel';
import './experience.css';

// Task4-9 模型体验页：
// - 模型类型 chips（复用模型广场模态交互，默认 text）
// - 应用/模型双重联动（应用配置模型 ∩ 用户可用模型 ∩ 类型模态匹配）
// - 三类体验窗口：文本 SSE chat / 图片理解 / 语音转文字；video 占位
// 模态数据源：GET /api/user/models/modalities（market_models 投影）

const ITEMS_PER_PAGE = 10;
const TYPES = ['text', 'image', 'audio', 'video'];
const TYPE_ICONS = {
  text: 'align justify',
  image: 'image',
  audio: 'headphones',
  video: 'video',
};

// 模态判定：rec 为 market_models 投影记录；无记录的模型保守归入 text
const matchModality = (rec, type) => {
  if (type === 'text') return !rec || (rec.output_modalities || []).includes('text');
  if (!rec) return false;
  const input = rec.input_modalities || [];
  const output = rec.output_modalities || [];
  if (type === 'image') return input.includes('image') && output.includes('text');
  if (type === 'audio') return input.includes('audio') && output.includes('text');
  if (type === 'video') return input.includes('video') || output.includes('video');
  return false;
};

const Experience = () => {
  const { t } = useTranslation();
  const [modality, setModality] = useState('text');
  const [apps, setApps] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [modalityMap, setModalityMap] = useState({});
  const [appKey, setAppKey] = useState('');
  const [model, setModel] = useState('');

  useEffect(() => {
    loadApplications();
    loadAvailableModels();
    loadModalities();
  }, []);

  const loadApplications = async () => {
    try {
      let all = [];
      for (let p = 0; p < 100; p++) {
        const res = await API.get(`/api/application/?p=${p}`);
        if (!res || !res.data) return; // 401 等错误已由拦截器统一提示并跳登录
        const { success, message, data } = res.data;
        if (!success) {
          showError(message);
          return;
        }
        all = all.concat(data);
        if (data.length < ITEMS_PER_PAGE) break;
      }
      const enabled = all.filter((a) => a.status === 1);
      setApps(enabled);
      if (enabled.length > 0) {
        setAppKey((prev) => prev || enabled[0].key);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const res = await API.get('/api/user/available_models');
      if (!res || !res.data) return;
      const { success, message, data } = res.data;
      if (success && Array.isArray(data)) {
        setAvailableModels(data);
      } else if (!success) {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  const loadModalities = async () => {
    try {
      const res = await API.get('/api/user/models/modalities');
      if (!res || !res.data) return;
      const { success, message, data } = res.data;
      if (success && Array.isArray(data)) {
        const map = {};
        data.forEach((item) => {
          map[item.id] = item;
        });
        setModalityMap(map);
      } else if (!success) {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  // 应用配置的模型白名单（空 = 不限模型）
  const getAppAllowedModels = (app) => {
    if (!app || !app.models) return null;
    const list = String(app.models)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length > 0 ? list : null;
  };

  // 当前类型下用户可用模型
  const typeModels = useMemo(
    () =>
      availableModels.filter((m) => matchModality(modalityMap[m], modality)),
    [availableModels, modalityMap, modality]
  );

  // 应用 × 类型 双重交集后的模型列表
  const effectiveModels = useMemo(() => {
    const current = apps.find((a) => a.key === appKey);
    const allowed = getAppAllowedModels(current);
    if (allowed) {
      return typeModels.filter((m) => allowed.includes(m));
    }
    return typeModels;
  }, [apps, appKey, typeModels]);

  // 每个应用在当前类型下是否有可体验模型（决定应用下拉置灰）
  const appAvailability = useMemo(() => {
    const map = {};
    apps.forEach((a) => {
      const allowed = getAppAllowedModels(a);
      const ms = allowed
        ? typeModels.filter((m) => allowed.includes(m))
        : typeModels;
      map[a.key] = ms.length > 0;
    });
    return map;
  }, [apps, typeModels]);

  // 联动重置：当前应用在当前类型下无可用模型则切换到首个可用应用；
  // 当前模型不在交集内则重置为首个
  useEffect(() => {
    if (apps.length === 0) return;
    const current = apps.find((a) => a.key === appKey);
    if (current && appAvailability[appKey] === false) {
      const first = apps.find((a) => appAvailability[a.key]);
      setAppKey(first ? first.key : '');
      return;
    }
    if (model && !effectiveModels.includes(model)) {
      setModel(effectiveModels.length > 0 ? effectiveModels[0] : '');
    }
    if (!model && effectiveModels.length > 0) {
      setModel(effectiveModels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality, apps, appKey, availableModels, modalityMap]);

  const appOptions = apps.map((a) => ({
    key: a.id,
    text: a.name,
    value: a.key,
    disabled: appAvailability[a.key] === false,
  }));

  const modelOptions = effectiveModels.map((m) => ({
    key: m,
    text: m,
    value: m,
  }));

  const renderPanel = () => {
    if (modality === 'text') {
      return <TextPanel appKey={appKey} model={model} />;
    }
    if (modality === 'image') {
      return <ImagePanel appKey={appKey} model={model} />;
    }
    if (modality === 'audio') {
      return <AudioPanel appKey={appKey} model={model} />;
    }
    return (
      <EmptyState
        icon='video'
        title={t('experience.unsupported.title')}
        description={t('experience.unsupported.desc')}
      />
    );
  };

  return (
    <div className='dashboard-container experience-page'>
      <div className='exp-toolbar'>
        <div className='exp-chip-row'>
          {TYPES.map((tp) => (
            <button
              key={tp}
              type='button'
              className={`exp-chip${modality === tp ? ' exp-chip-active' : ''}`}
              onClick={() => setModality(tp)}
            >
              <Icon name={TYPE_ICONS[tp] || 'circle'} />
              {t(`marketplace.modality.${tp}`)}
            </button>
          ))}
          <span className='exp-hint'>
            <Icon name='info circle' />
            {t('experience.type_hint')}
          </span>
        </div>
        <div className='exp-selects'>
          <Dropdown
            selection
            placeholder={t('playground.app_placeholder')}
            options={appOptions}
            value={appKey}
            onChange={(e, { value }) => setAppKey(value)}
          />
          <Dropdown
            selection
            search
            placeholder={t('playground.model_placeholder')}
            options={modelOptions}
            value={model}
            onChange={(e, { value }) => setModel(value)}
          />
          {effectiveModels.length === 0 && (
            <span className='exp-hint'>
              <Icon name='exclamation triangle' />
              {t('experience.no_models')}
            </span>
          )}
        </div>
      </div>
      <div className='exp-panel'>{renderPanel()}</div>
    </div>
  );
};

export default Experience;

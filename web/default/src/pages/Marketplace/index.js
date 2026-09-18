import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from 'semantic-ui-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers';
import './marketplace.css';

// Task4-1 模型广场：七牛模型库每日同步后的公开展示页（无需登录）
// 列表筛选/分页/排序全部同步 URL query，支持刷新保持与分享

const REGION_TABS = ['all', 'domestic', 'overseas'];
const MODALITIES = ['text', 'image', 'video', 'audio'];
const QUICK_FEATURES = [
  'reasoning',
  'tool_call',
  'image_generation',
  'video_generation',
  'web_search',
  'long_context',
  'ai_coding',
  'image_understanding',
];
const SORTS = ['rank', 'price_asc', 'context_desc'];
const PRICE_KEY_LABELS = {
  input: 'price_key.input',
  output: 'price_key.output',
  ncache: 'price_key.ncache',
  cache: 'price_key.cache',
  c_cache: 'price_key.c_cache',
  ex_cache: 'price_key.ex_cache',
  bi_input: 'price_key.bi_input',
  bi_output: 'price_key.bi_output',
  th_input: 'price_key.th_input',
  th_output: 'price_key.th_output',
  nth_input: 'price_key.nth_input',
  nth_output: 'price_key.nth_output',
  t_input: 'price_key.t_input',
  t_output: 'price_key.t_output',
  i_input: 'price_key.i_input',
  i_output: 'price_key.i_output',
  a_input: 'price_key.a_input',
  web_search_req: 'price_key.web_search_req',
  ti_quantity: 'price_key.ti_quantity',
  ii_quantity: 'price_key.ii_quantity',
  mi2i_quantity: 'price_key.mi2i_quantity',
  v_duration: 'price_key.v_duration',
  av_duration: 'price_key.av_duration',
};

const trimMoney = (v) => {
  if (!isFinite(v)) return '-';
  const s = Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4);
  return s.replace(/\.?0+$/, '');
};

const fmtContext = (v) => {
  if (!v || v <= 0) return '';
  if (v >= 1_000_000) {
    const n = v / 1_000_000;
    return `${parseFloat(n.toFixed(1))}M`;
  }
  return `${Math.round(v / 1000)}K`;
};

const fmtInt = (v) => Number(v || 0).toLocaleString();

// 图片加载失败降级为首字母圆底
const ModelAvatar = ({ src, name, kind = 'model' }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`mk-avatar mk-avatar-fallback mk-avatar-${kind}`}>
        {(name || '?').charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      className={`mk-avatar mk-avatar-${kind}`}
      src={src}
      alt={name}
      loading='lazy'
      referrerPolicy='no-referrer'
      onError={() => setFailed(true)}
    />
  );
};

// 标签翻译：code → i18n，未知 code 原样输出（后端对未知枚举保留原文）
const useTagLabel = () => {
  const { t } = useTranslation();
  return (code) => {
    const hot = t(`marketplace.hot_tags.${code}`, { defaultValue: '' });
    if (hot) return hot;
    const feat = t(`marketplace.features.${code}`, { defaultValue: '' });
    if (feat) return feat;
    return code;
  };
};

const RegionBadge = ({ region }) => {
  const { t } = useTranslation();
  if (region === 'domestic') {
    return (
      <span className='mk-region mk-region-domestic'>
        {t('marketplace.region.domestic_short')}
      </span>
    );
  }
  return (
    <span className='mk-region mk-region-overseas'>
      {t('marketplace.region.overseas_short')}
    </span>
  );
};

const TagLabel = ({ code }) => {
  const tagLabel = useTagLabel();
  return <>{tagLabel(code)}</>;
};

const TagChip = ({ code, kind }) => (
  <span className={`mk-tag mk-tag-${kind}`}>
    <TagLabel code={code} />
  </span>
);

const ModalityIcons = ({ modalities }) => {
  const { t } = useTranslation();
  const icons = {
    text: 'align justify',
    image: 'image',
    video: 'video',
    audio: 'headphones',
    file: 'file',
  };
  return (
    <span className='mk-modalities'>
      {modalities.map((m) => (
        <span key={m} className='mk-modality' title={t(`marketplace.modality.${m}`)}>
          <Icon name={icons[m] || 'circle'} />
          {t(`marketplace.modality.${m}`, { defaultValue: m })}
        </span>
      ))}
    </span>
  );
};

const PriceBlock = ({ price }) => {
  const { t } = useTranslation();
  if (price.is_free) {
    return (
      <div className='mk-price mk-price-free'>
        <Icon name='gift' />
        {t('marketplace.card.free')}
      </div>
    );
  }
  if (price.unit === 'token') {
    if (price.input < 0 && price.output < 0) {
      return <div className='mk-price mk-price-pending'>{t('marketplace.card.price_pending')}</div>;
    }
    return (
      <div className='mk-price mk-price-token'>
        {price.input >= 0 && (
          <div className='mk-price-row'>
            <span className='mk-price-label'>{t('marketplace.card.input')}</span>
            <span className='mk-price-value'>
              ¥{trimMoney(price.input)}
              <em>{t('marketplace.card.per_million')}</em>
            </span>
          </div>
        )}
        {price.output >= 0 && (
          <div className='mk-price-row'>
            <span className='mk-price-label'>{t('marketplace.card.output')}</span>
            <span className='mk-price-value'>
              ¥{trimMoney(price.output)}
              <em>{t('marketplace.card.per_million')}</em>
            </span>
          </div>
        )}
      </div>
    );
  }
  if (price.unit === 'image' || price.unit === 'second') {
    if (price.input < 0) {
      return <div className='mk-price mk-price-pending'>{t('marketplace.card.price_pending')}</div>;
    }
    return (
      <div className='mk-price mk-price-single'>
        <span className='mk-price-main'>
          ¥{trimMoney(price.input)}
          <em>{price.unit === 'image' ? t('marketplace.card.per_image') : t('marketplace.card.per_second')}</em>
        </span>
      </div>
    );
  }
  return <div className='mk-price mk-price-pending'>{t('marketplace.card.price_pending')}</div>;
};

const ModelCard = ({ model, integrated, onOpen }) => {
  const { t } = useTranslation();
  const ctx = fmtContext(model.context_length);
  return (
    <div
      className='mk-card'
      role='button'
      tabIndex={0}
      onClick={() => onOpen(model.model_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(model.model_id);
      }}
    >
      <div className='mk-card-head'>
        <ModelAvatar src={model.avatar} name={model.name} />
        <div className='mk-card-title-wrap'>
          <div className='mk-card-title'>{model.name}</div>
          <div className='mk-card-issuer'>
            {model.issuer_avatar ? (
              <img
                src={model.issuer_avatar}
                alt=''
                referrerPolicy='no-referrer'
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : null}
            <span>{model.issuer_name}</span>
          </div>
        </div>
        <RegionBadge region={model.region} />
      </div>

      <div className='mk-card-tags'>
        {model.hot_tags.slice(0, 2).map((code) => (
          <TagChip key={code} code={code} kind='hot' />
        ))}
        {model.features.slice(0, 3).map((code) => (
          <TagChip key={code} code={code} kind='feature' />
        ))}
        {model.features.length > 3 && (
          <span className='mk-tag mk-tag-more'>+{model.features.length - 3}</span>
        )}
        {integrated && (
          <span className='mk-tag mk-tag-integrated'>
            <Icon name='check circle' />
            {t('marketplace.card.integrated')}
          </span>
        )}
      </div>

      <div className='mk-card-desc'>{model.short_description || t('marketplace.card.no_description')}</div>

      <div className='mk-card-meta'>
        <ModalityIcons modalities={model.input_modalities} />
        {ctx && (
          <span className='mk-context'>
            <Icon name='code' />
            {t('marketplace.card.context')} {ctx}
          </span>
        )}
      </div>

      <div className='mk-card-bottom'>
        <PriceBlock price={model.price} />
        {model.retirement_at && (
          <span className='mk-retiring'>
            <Icon name='clock outline' />
            {t('marketplace.card.retiring')}
          </span>
        )}
      </div>
    </div>
  );
};

const SkeletonCard = () => (
  <div className='mk-card mk-card-skeleton'>
    <div className='mk-skel mk-skel-head' />
    <div className='mk-skel mk-skel-line w80' />
    <div className='mk-skel mk-skel-line w60' />
    <div className='mk-skel mk-skel-block' />
  </div>
);

const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  const pages = [];
  const push = (p) => pages.push(p);
  const win = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - win && p <= page + win)) {
      push(p);
    } else if (pages[pages.length - 1] !== '…') {
      push('…');
    }
  }
  return (
    <div className='mk-pagination'>
      <button
        type='button'
        className='mk-page-btn'
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <Icon name='chevron left' />
      </button>
      {pages.map((p, idx) =>
        p === '…' ? (
          <span key={`e${idx}`} className='mk-page-ellipsis'>
            …
          </span>
        ) : (
          <button
            key={p}
            type='button'
            className={`mk-page-btn${p === page ? ' mk-page-active' : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type='button'
        className='mk-page-btn'
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <Icon name='chevron right' />
      </button>
    </div>
  );
};

// ---------------- 详情抽屉 ----------------

const DrawerEntryPrice = ({ item }) => {
  const { t } = useTranslation();
  const unit = (item.unit_name || '').toLowerCase();
  if (unit === 'token') {
    const size = item.unit_size > 0 ? item.unit_size : 1;
    const rmb = (item.unit_price / size) * 1_000_000;
    const usd = (item.unit_price_usd / size) * 1_000_000;
    return (
      <span className='mk-d-price'>
        <strong>¥{trimMoney(rmb)}</strong>
        <em>{t('marketplace.detail.per_million')}</em>
        {item.unit_price_usd > 0 && <span className='mk-d-usd'>(${trimMoney(usd)})</span>}
        {item.unit_price === 0 && <span className='mk-d-free-flag'>{t('marketplace.card.free')}</span>}
      </span>
    );
  }
  if (unit === 'pic' || unit === 'image' || unit === 'images') {
    return (
      <span className='mk-d-price'>
        <strong>¥{trimMoney(item.unit_price)}</strong>
        <em>{t('marketplace.detail.per_image')}</em>
        {item.unit_price_usd > 0 && <span className='mk-d-usd'>(${trimMoney(item.unit_price_usd)})</span>}
      </span>
    );
  }
  if (unit === 'second' || unit === 'time') {
    return (
      <span className='mk-d-price'>
        <strong>¥{trimMoney(item.unit_price)}</strong>
        <em>{t('marketplace.detail.per_second')}</em>
        {item.unit_price_usd > 0 && <span className='mk-d-usd'>(${trimMoney(item.unit_price_usd)})</span>}
      </span>
    );
  }
  return (
    <span className='mk-d-price'>
      <strong>¥{trimMoney(item.unit_price)}</strong>
      <em>/{item.unit_name}</em>
    </span>
  );
};

const DetailDrawer = ({ modelId, integrated, onClose }) => {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!modelId) return;
    setLoading(true);
    setNotFound(false);
    setDetail(null);
    API.get('/api/marketplace/detail', { params: { id: modelId } })
      .then((res) => {
        const { success, message, data } = res.data || {};
        if (success && data) {
          setDetail(data);
        } else if (message === 'model not found') {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [modelId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const raw = detail?.detail || {};
  const tiers = Array.isArray(raw.pricing_rules_v2) ? raw.pricing_rules_v2 : [];
  const singleFlatTier =
    tiers.length === 1 &&
    Array.isArray(tiers[0].input_range) &&
    tiers[0].input_range[0] === 0 &&
    tiers[0].input_range[1] >= 99999999;

  const rangeText = (range) => {
    if (!Array.isArray(range)) return '';
    const [a, b] = range;
    const left = fmtInt(a);
    if (b >= 99999999) {
      return a === 0 ? t('marketplace.detail.range_any') : `${left} ${t('marketplace.detail.range_above')}`;
    }
    return `${left} ~ ${fmtInt(b)}`;
  };

  const entryLabel = (key, item) => {
    const i18nKey = PRICE_KEY_LABELS[key] ? `marketplace.detail.${PRICE_KEY_LABELS[key]}` : null;
    const text = i18nKey ? t(i18nKey, { defaultValue: '' }) : '';
    return text || item?.name || key;
  };

  const rateLimit = raw.rate_limit || {};
  const rateOrder = ['rpm', 'tpm', 'qpm', 'ipm'];
  const rates = rateOrder.filter((k) => rateLimit[k]);

  const hasCapabilitySection =
    detail &&
    (detail.input_modalities?.length ||
      detail.output_modalities?.length ||
      detail.capabilities?.length ||
      detail.context_length > 0 ||
      detail.max_output_tokens > 0 ||
      detail.protocols?.length);
  const hasOtherSection =
    detail &&
    (detail.release_at || detail.filing || detail.model_alias?.length || detail.suggested_model);

  const capabilityRows = [
    ['function_calling', detail?.capabilities?.includes('function_calling')],
    ['reasoning', detail?.capabilities?.includes('reasoning')],
    ['schema_output', detail?.capabilities?.includes('schema_output')],
    ['content_cache', detail?.capabilities?.includes('content_cache')],
  ].filter(([, v]) => v);

  return (
    <div className='mk-drawer-root' role='dialog' aria-modal='true'>
      <div className='mk-drawer-mask' onClick={onClose} />
      <div className='mk-drawer'>
        <div className='mk-drawer-header'>
          {detail && (
            <>
              <ModelAvatar src={detail.avatar} name={detail.name} kind='large' />
              <div className='mk-drawer-title-wrap'>
                <div className='mk-drawer-title-row'>
                  <h2 className='mk-drawer-title'>{detail.name}</h2>
                  <RegionBadge region={detail.region} />
                  {integrated && (
                    <span className='mk-tag mk-tag-integrated'>
                      <Icon name='check circle' />
                      {t('marketplace.card.integrated')}
                    </span>
                  )}
                </div>
                <div className='mk-drawer-issuer'>
                  {raw.issuer?.model_page ? (
                    <a href={raw.issuer.model_page} target='_blank' rel='noreferrer'>
                      {detail.issuer_name}
                      <Icon name='external alternate' />
                    </a>
                  ) : (
                    <span>{detail.issuer_name}</span>
                  )}
                  <span className='mk-drawer-modelid'>{detail.model_id}</span>
                </div>
                <div className='mk-card-tags mk-drawer-tags'>
                  {detail.hot_tags.map((code) => (
                    <TagChip key={code} code={code} kind='hot' />
                  ))}
                  {detail.features.map((code) => (
                    <TagChip key={code} code={code} kind='feature' />
                  ))}
                </div>
              </div>
            </>
          )}
          <button type='button' className='mk-drawer-close' onClick={onClose} aria-label='close'>
            <Icon name='close' />
          </button>
        </div>

        <div className='mk-drawer-body' ref={bodyRef}>
          {loading && (
            <div className='mk-drawer-loading'>
              <Icon name='circle notched' loading />
            </div>
          )}
          {!loading && notFound && (
            <div className='mk-drawer-loading'>{t('marketplace.detail.not_found')}</div>
          )}
          {!loading && detail && (
            <>
              {detail.short_description && (
                <section className='mk-d-section'>
                  <h3>{t('marketplace.detail.description')}</h3>
                  <p className='mk-desc-full'>{raw.description || detail.short_description}</p>
                </section>
              )}

              {hasCapabilitySection && (
                <section className='mk-d-section'>
                  <h3>
                    <Icon name='sliders horizontal' />
                    {t('marketplace.detail.capabilities')}
                  </h3>
                  <div className='mk-d-grid'>
                    {detail.input_modalities.length > 0 && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.input_modality')}</label>
                        <span>
                          {detail.input_modalities
                            .map((m) => t(`marketplace.modality.${m}`, { defaultValue: m }))
                            .join(' / ')}
                        </span>
                      </div>
                    )}
                    {detail.output_modalities.length > 0 && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.output_modality')}</label>
                        <span>
                          {detail.output_modalities
                            .map((m) => t(`marketplace.modality.${m}`, { defaultValue: m }))
                            .join(' / ')}
                        </span>
                      </div>
                    )}
                    {capabilityRows.map(([key]) => (
                      <div className='mk-d-field' key={key}>
                        <label>{t(`marketplace.detail.${key}`)}</label>
                        <span className='mk-d-check'>
                          <Icon name='check' />
                        </span>
                      </div>
                    ))}
                    {detail.context_length > 0 && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.context_length')}</label>
                        <span>{fmtInt(detail.context_length)}</span>
                      </div>
                    )}
                    {detail.max_output_tokens > 0 && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.max_output')}</label>
                        <span>{fmtInt(detail.max_output_tokens)}</span>
                      </div>
                    )}
                    {detail.protocols.length > 0 && (
                      <div className='mk-d-field mk-d-field-full'>
                        <label>{t('marketplace.detail.protocols')}</label>
                        <span className='mk-d-protocols'>
                          {detail.protocols.map((p) => (
                            <span key={p} className='mk-proto'>
                              {p}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className='mk-d-section'>
                <h3>
                  <Icon name='yen' />
                  {t('marketplace.detail.price')}
                </h3>
                {detail.price.is_free && (
                  <div className='mk-d-free-banner'>
                    <Icon name='gift' />
                    {t('marketplace.card.free')}
                  </div>
                )}
                {!detail.price.is_free && tiers.length === 0 && (
                  <div className='mk-d-price-pending'>
                    {t('marketplace.card.price_pending')}
                    {detail.pricing_page_url && (
                      <a href={detail.pricing_page_url} target='_blank' rel='noreferrer'>
                        {t('marketplace.detail.official_pricing')}
                        <Icon name='external alternate' />
                      </a>
                    )}
                  </div>
                )}
                {tiers.map((tier, idx) => {
                  const entries = Object.entries(tier.details_v2 || {}).filter(
                    ([, item]) => item
                  );
                  if (entries.length === 0) return null;
                  return (
                    <div className='mk-tier' key={idx}>
                      {!singleFlatTier && (
                        <div className='mk-tier-range'>
                          <span className='mk-tier-range-label'>
                            {t('marketplace.detail.tier_range')}
                          </span>
                          <span>
                            {t('marketplace.detail.input')}：{rangeText(tier.input_range)}
                          </span>
                          <span>
                            {t('marketplace.detail.output')}：{rangeText(tier.output_range)}
                          </span>
                        </div>
                      )}
                      <div className='mk-tier-entries'>
                        {entries.map(([key, item]) => (
                          <div className='mk-tier-row' key={key}>
                            <span className='mk-tier-name'>{entryLabel(key, item)}</span>
                            <DrawerEntryPrice item={item} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              {rates.length > 0 && (
                <section className='mk-d-section'>
                  <h3>
                    <Icon name='shield' />
                    {t('marketplace.detail.rate_limit')}
                  </h3>
                  <div className='mk-d-rates'>
                    {rates.map((k) => (
                      <div className='mk-rate' key={k}>
                        <label>{t(`marketplace.detail.rate.${k}`, { defaultValue: rateLimit[k].name || k })}</label>
                        <span>
                          {fmtInt(rateLimit[k].quantity)}
                          <em>/{t('marketplace.detail.rate.minute')}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {hasOtherSection && (
                <section className='mk-d-section'>
                  <h3>
                    <Icon name='info circle' />
                    {t('marketplace.detail.other')}
                  </h3>
                  <div className='mk-d-grid'>
                    {detail.release_at && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.release_at')}</label>
                        <span>{detail.release_at}</span>
                      </div>
                    )}
                    {detail.retirement_at && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.retirement_at')}</label>
                        <span>{detail.retirement_at}</span>
                      </div>
                    )}
                    {detail.filing && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.filing')}</label>
                        <span>{detail.filing}</span>
                      </div>
                    )}
                    {detail.model_alias.length > 0 && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.alias')}</label>
                        <span>{detail.model_alias.join(', ')}</span>
                      </div>
                    )}
                    {detail.suggested_model && (
                      <div className='mk-d-field'>
                        <label>{t('marketplace.detail.suggested')}</label>
                        <span>{detail.suggested_model}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {!loading && detail && (
          <div className='mk-drawer-footer'>
            {detail.pricing_page_url && (
              <a
                className='mk-d-btn mk-d-btn-ghost'
                href={detail.pricing_page_url}
                target='_blank'
                rel='noreferrer'
              >
                <Icon name='external alternate' />
                {t('marketplace.detail.official_pricing')}
              </a>
            )}
            {integrated ? (
              <Link className='mk-d-btn mk-d-btn-primary' to='/playground'>
                {t('marketplace.detail.go_chat')}
                <Icon name='arrow right' />
              </Link>
            ) : (
              <Link className='mk-d-btn mk-d-btn-primary' to='/topup'>
                {t('marketplace.detail.use_now')}
                <Icon name='arrow right' />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------- 页面主体 ----------------

const Marketplace = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [facets, setFacets] = useState({ issuers: [], counts: {}, last_sync_time: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [keywordInput, setKeywordInput] = useState(searchParams.get('q') || '');
  const [drawerId, setDrawerId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [localModels, setLocalModels] = useState(() => new Set());

  const params = useMemo(
    () => ({
      region: REGION_TABS.includes(searchParams.get('region'))
        ? searchParams.get('region')
        : 'all',
      q: searchParams.get('q') || '',
      issuer: searchParams.get('issuer') || '',
      modality: MODALITIES.includes(searchParams.get('modality'))
        ? searchParams.get('modality')
        : '',
      feature: searchParams.get('feature') || '',
      sort: SORTS.includes(searchParams.get('sort')) ? searchParams.get('sort') : 'rank',
      page: Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1),
    }),
    [searchParams]
  );

  const updateParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === '' || v === 'all') {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    });
    setSearchParams(next, { replace: false });
  };

  // 搜索框防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchParams.get('q') || '';
      if (q !== keywordInput) {
        updateParams({ q: keywordInput || undefined, page: undefined });
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordInput]);

  const loadModels = async () => {
    setLoading(true);
    setError(false);
    try {
      const query = new URLSearchParams();
      if (params.region !== 'all') query.set('region', params.region);
      if (params.q) query.set('q', params.q);
      if (params.issuer) query.set('issuer', params.issuer);
      if (params.modality) query.set('modality', params.modality);
      if (params.feature) query.set('feature', params.feature);
      if (params.sort !== 'rank') query.set('sort', params.sort);
      query.set('page', String(params.page));
      query.set('page_size', '24');
      const res = await API.get(`/api/marketplace/models?${query.toString()}`);
      const { success, message, data: resp } = res.data || {};
      if (success && resp) {
        setData(resp);
        if (resp.facets) setFacets(resp.facets);
      } else if (message === 'disabled') {
        setDisabled(true);
        setData(null);
      } else {
        setError(true);
      }
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // P1：与本站 /api/pricing 已接入模型做后缀模糊匹配，命中显示「本站已接入」
  useEffect(() => {
    API.get('/api/pricing')
      .then((res) => {
        const { success, data: items } = res.data || {};
        if (success && Array.isArray(items)) {
          setLocalModels(new Set(items.map((it) => String(it.model || '').toLowerCase())));
        }
      })
      .catch(() => {});
  }, []);

  const integratedSet = useMemo(() => {
    const matched = new Set();
    if (!localModels.size || !data) return matched;
    data.items.forEach((m) => {
      const tail = m.model_id.split('/').pop().toLowerCase();
      for (const name of localModels) {
        if (name.length < 4) continue;
        if (name === tail || (tail.length >= 6 && (name.includes(tail) || tail.includes(name)))) {
          matched.add(m.model_id);
          break;
        }
      }
    });
    return matched;
  }, [localModels, data]);

  const isIntegrated = (modelId) => integratedSet.has(modelId);

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.page_size || 24)));
  const counts = facets.counts || {};

  if (disabled) {
    return (
      <div className='marketplace-page'>
        <div className='mk-disabled'>{t('marketplace.disabled')}</div>
      </div>
    );
  }

  return (
    <div className='marketplace-page'>
      <div className='mk-hero'>
        <h1 className='mk-hero-title'>
          <Icon name='shop' />
          {t('marketplace.title')}
        </h1>
        <p className='mk-hero-sub'>{t('marketplace.subtitle')}</p>
        <div className='mk-search'>
          <Icon name='search' />
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder={t('marketplace.search_placeholder')}
          />
          {keywordInput && (
            <button
              type='button'
              className='mk-search-clear'
              onClick={() => {
                setKeywordInput('');
                updateParams({ q: undefined, page: undefined });
              }}
            >
              <Icon name='times circle' />
            </button>
          )}
        </div>
      </div>

      <div className='mk-region-tabs'>
        {REGION_TABS.map((r) => (
          <button
            key={r}
            type='button'
            className={`mk-region-tab${params.region === r ? ' mk-region-tab-active' : ''}`}
            onClick={() => updateParams({ region: r === 'all' ? undefined : r, page: undefined })}
          >
            {r === 'domestic' && <span className='mk-tab-flag'>🇨🇳</span>}
            {r === 'overseas' && <span className='mk-tab-flag'>🌏</span>}
            {t(`marketplace.tabs.${r}`)}
            <span className='mk-tab-count'>{counts[r] ?? (r === 'all' ? total : 0)}</span>
          </button>
        ))}
        <button
          type='button'
          className='mk-filters-toggle'
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Icon name='filter' />
          {t('marketplace.filters.toggle')}
        </button>
      </div>

      <div className={`mk-filters${filtersOpen ? ' mk-filters-open' : ''}`}>
        <div className='mk-filter-group'>
          <span className='mk-filter-label'>{t('marketplace.filters.issuer')}</span>
          <select
            value={params.issuer}
            onChange={(e) => updateParams({ issuer: e.target.value || undefined, page: undefined })}
          >
            <option value=''>{t('marketplace.filters.issuer_all')}</option>
            {facets.issuers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className='mk-filter-group'>
          <span className='mk-filter-label'>{t('marketplace.filters.modality')}</span>
          <div className='mk-chip-row'>
            <button
              type='button'
              className={`mk-chip${params.modality === '' ? ' mk-chip-active' : ''}`}
              onClick={() => updateParams({ modality: undefined, page: undefined })}
            >
              {t('marketplace.filters.all')}
            </button>
            {MODALITIES.map((m) => (
              <button
                key={m}
                type='button'
                className={`mk-chip${params.modality === m ? ' mk-chip-active' : ''}`}
                onClick={() =>
                  updateParams({
                    modality: params.modality === m ? undefined : m,
                    page: undefined,
                  })
                }
              >
                <Icon
                  name={
                    { text: 'align justify', image: 'image', video: 'video', audio: 'headphones' }[m]
                  }
                />
                {t(`marketplace.modality.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className='mk-filter-group mk-filter-features'>
          <span className='mk-filter-label'>{t('marketplace.filters.feature')}</span>
          <div className='mk-chip-row'>
            {QUICK_FEATURES.map((f) => (
              <button
                key={f}
                type='button'
                className={`mk-chip mk-chip-feature${params.feature === f ? ' mk-chip-active' : ''}`}
                onClick={() =>
                  updateParams({
                    feature: params.feature === f ? undefined : f,
                    page: undefined,
                  })
                }
              >
                {t(`marketplace.features.${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className='mk-filter-group mk-filter-sort'>
          <span className='mk-filter-label'>{t('marketplace.filters.sort')}</span>
          <select
            value={params.sort}
            onChange={(e) => updateParams({ sort: e.target.value, page: undefined })}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`marketplace.sort.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className='mk-state'>
          <Icon name='warning sign' size='large' />
          <p>{t('marketplace.load_failed')}</p>
          <button type='button' className='mk-d-btn mk-d-btn-primary' onClick={loadModels}>
            {t('marketplace.retry')}
          </button>
        </div>
      ) : loading && !data ? (
        <div className='mk-grid'>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className='mk-state'>
          <Icon name='search' size='large' />
          <p>{t('marketplace.empty')}</p>
        </div>
      ) : (
        <>
          <div className={`mk-grid${loading ? ' mk-grid-loading' : ''}`}>
            {items.map((m) => (
              <ModelCard
                key={m.model_id}
                model={m}
                integrated={isIntegrated(m.model_id)}
                onOpen={setDrawerId}
              />
            ))}
          </div>
          <Pagination
            page={params.page}
            totalPages={totalPages}
            onChange={(p) => {
              updateParams({ page: p === 1 ? undefined : p });
              document.querySelector('.main-content')?.scrollTo({ top: 0 });
            }}
          />
        </>
      )}

      <div className='mk-footer-note'>
        {t('marketplace.footer.tip')}
        {facets.last_sync_time
          ? t('marketplace.footer.updated', { time: facets.last_sync_time })
          : t('marketplace.footer.never')}
      </div>

      {drawerId && (
        <DetailDrawer
          modelId={drawerId}
          integrated={isIntegrated(drawerId)}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  );
};

export default Marketplace;

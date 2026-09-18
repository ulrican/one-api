import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Input, Table } from 'semantic-ui-react';
import { API } from '../../helpers';
import { useTranslation } from 'react-i18next';
import './pricing.css';

const Pricing = () => {
  const { t } = useTranslation();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  const loadPricing = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/pricing');
      const { success, data } = res.data;
      if (success && Array.isArray(data)) {
        setModels(data);
      }
    } catch (err) {
      // 静默
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPricing();
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return models;
    return models.filter((m) => m.model.toLowerCase().includes(kw));
  }, [models, keyword]);

  const fmt = (v) => {
    if (v === 0) return '0';
    if (v < 0.0001) return v.toExponential(2);
    return v.toFixed(4);
  };

  return (
    <div className='pricing-page'>
      <div className='pricing-hero'>
        <div className='pricing-hero-title'>
          <Icon name='dollar' />
          {t('pricing.title')}
        </div>
        <div className='pricing-hero-sub'>{t('pricing.subtitle')}</div>
        <Input
          icon='search'
          placeholder={t('pricing.search_placeholder')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className='pricing-search'
        />
      </div>

      <div className='pricing-table-wrap'>
        <Table basic='very' className='pricing-table'>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t('pricing.columns.model')}</Table.HeaderCell>
              <Table.HeaderCell>{t('pricing.columns.groups')}</Table.HeaderCell>
              <Table.HeaderCell textAlign='right'>
                {t('pricing.columns.input')}
                <span className='pricing-unit'>({t('pricing.unit')})</span>
              </Table.HeaderCell>
              <Table.HeaderCell textAlign='right'>
                {t('pricing.columns.output')}
                <span className='pricing-unit'>({t('pricing.unit')})</span>
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell colSpan={4} className='pricing-loading'>
                  <Icon name='circle notched' loading />
                </Table.Cell>
              </Table.Row>
            ) : filtered.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={4} className='pricing-empty'>
                  {t('pricing.empty')}
                </Table.Cell>
              </Table.Row>
            ) : (
              filtered.map((m) => (
                <Table.Row key={m.model}>
                  <Table.Cell className='pricing-model'>{m.model}</Table.Cell>
                  <Table.Cell className='pricing-groups'>
                    {(m.groups || []).map((g) => (
                      <span key={g} className='pricing-group-tag'>
                        {g}
                      </span>
                    ))}
                  </Table.Cell>
                  <Table.Cell textAlign='right' className='pricing-price'>
                    {fmt(m.input_price_rmb)}
                  </Table.Cell>
                  <Table.Cell textAlign='right' className='pricing-price'>
                    {fmt(m.output_price_rmb)}
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </div>
    </div>
  );
};

export default Pricing;

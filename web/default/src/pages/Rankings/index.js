import React, { useEffect, useState } from 'react';
import { Button, Icon, Table } from 'semantic-ui-react';
import { API } from '../../helpers';
import { useTranslation } from 'react-i18next';
import './Rankings.css';

const RANGES = ['today', 'week', 'month', 'year'];

const Rankings = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('today');
  const [dimension, setDimension] = useState('model');
  const [disabled, setDisabled] = useState(false);

  const loadRankings = async (r) => {
    setLoading(true);
    setDisabled(false);
    try {
      const res = await API.get(`/api/rankings?range=${r}`);
      const { success, message, data: resp } = res.data;
      if (success && resp) {
        setData(resp);
      } else if (message === 'disabled') {
        setDisabled(true);
        setData(null);
      }
    } catch (err) {
      // 静默
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRankings(range);
  }, [range]);

  const fmtNum = (v) => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return String(v);
  };

  const items = data
    ? dimension === 'model'
      ? data.models
      : data.providers
    : [];

  return (
    <div className='rankings-page'>
      <div className='rankings-hero'>
        <div className='rankings-hero-title'>
          <Icon name='trophy' />
          {t('rankings.title')}
        </div>
        <div className='rankings-hero-sub'>{t('rankings.subtitle')}</div>
      </div>

      {disabled ? (
        <div className='rankings-empty'>{t('rankings.disabled')}</div>
      ) : (
        <>
          <div className='rankings-tabs'>
            <Button.Group size='small'>
              {RANGES.map((r) => (
                <Button
                  key={r}
                  active={range === r}
                  onClick={() => setRange(r)}
                >
                  {t(`rankings.range.${r}`)}
                </Button>
              ))}
            </Button.Group>
            <Button.Group size='small'>
              <Button
                active={dimension === 'model'}
                onClick={() => setDimension('model')}
              >
                {t('rankings.dim.model')}
              </Button>
              <Button
                active={dimension === 'provider'}
                onClick={() => setDimension('provider')}
              >
                {t('rankings.dim.provider')}
              </Button>
            </Button.Group>
          </div>

          <div className='rankings-table-wrap'>
            <Table basic='very' className='rankings-table'>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t('rankings.columns.rank')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('rankings.columns.name')}</Table.HeaderCell>
                  <Table.HeaderCell textAlign='right'>
                    {t('rankings.columns.requests')}
                  </Table.HeaderCell>
                  <Table.HeaderCell textAlign='right'>
                    {t('rankings.columns.tokens')}
                  </Table.HeaderCell>
                  <Table.HeaderCell textAlign='right'>
                    {t('rankings.columns.quota')}
                  </Table.HeaderCell>
                  <Table.HeaderCell textAlign='right'>
                    {t('rankings.columns.share')}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {loading ? (
                  <Table.Row>
                    <Table.Cell colSpan={6} className='rankings-loading'>
                      <Icon name='circle notched' loading />
                    </Table.Cell>
                  </Table.Row>
                ) : items.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={6} className='rankings-empty'>
                      {t('rankings.empty')}
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  items.map((item, idx) => (
                    <Table.Row key={item.name + idx}>
                      <Table.Cell className='rankings-rank'>{idx + 1}</Table.Cell>
                      <Table.Cell className='rankings-name'>{item.name}</Table.Cell>
                      <Table.Cell textAlign='right' className='rankings-num'>
                        {fmtNum(item.request_count)}
                      </Table.Cell>
                      <Table.Cell textAlign='right' className='rankings-num'>
                        {fmtNum(item.tokens)}
                      </Table.Cell>
                      <Table.Cell textAlign='right' className='rankings-num'>
                        {fmtNum(item.quota)}
                      </Table.Cell>
                      <Table.Cell textAlign='right' className='rankings-share'>
                        {item.share}%
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

export default Rankings;

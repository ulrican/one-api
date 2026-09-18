import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {Button} from 'semantic-ui-react';
import axios from 'axios';
import {useTheme} from '../../context/Theme';
import EmptyState from '../../components/EmptyState';
import './Dashboard.css';

// recharts 图表色板：SVG 属性不读 CSS 变量，按主题提供具体色值（Task02 阶段 4）
const chartTheme = {
  dark: {
    axis: '#9ca3af',
    grid: 'rgba(255,255,255,0.07)',
    tooltipBg: '#161f2e',
    tooltipBorder: '1px solid #1f2937',
    tooltipText: '#f9fafb',
    tooltipShadow: '0 12px 32px -8px rgba(0,0,0,0.6)',
    lines: {
      requests: '#60a5fa',
      quota: '#22d3ee',
      tokens: '#a78bfa',
    },
    bars: [
      '#60a5fa',
      '#22d3ee',
      '#a78bfa',
      '#34d399',
      '#fbbf24',
      '#fb7185',
      '#4ade80',
      '#818cf8',
      '#fb923c',
      '#38bdf8',
    ],
  },
  light: {
    axis: '#64748b',
    grid: 'rgba(15,23,42,0.07)',
    tooltipBg: '#ffffff',
    tooltipBorder: '1px solid #e2e8f0',
    tooltipText: '#0f172a',
    tooltipShadow: '0 12px 32px -8px rgba(15,23,42,0.18)',
    lines: {
      requests: '#2563eb',
      quota: '#0891b2',
      tokens: '#7c3aed',
    },
    bars: [
      '#2563eb',
      '#0891b2',
      '#7c3aed',
      '#059669',
      '#d97706',
      '#e11d48',
      '#16a34a',
      '#4f46e5',
      '#ea580c',
      '#0284c7',
    ],
  },
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const ct = isDark ? chartTheme.dark : chartTheme.light;
  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState({
    todayRequests: 0,
    todayQuota: 0,
    todayTokens: 0,
  });
  // F8：RPM/TPM 实时指标 + 模型维度调用分析
  const [metrics, setMetrics] = useState({rpm: 0, tpm: 0, top_models: []});
  const [metricMode, setMetricMode] = useState('requests');

  useEffect(() => {
    fetchDashboardData();
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 30000);
    return () => clearInterval(timer);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await axios.get('/api/user/dashboard/metrics');
      if (response.data.success) {
        setMetrics(
          response.data.data || {rpm: 0, tpm: 0, top_models: []}
        );
      }
    } catch (error) {
      console.error('Failed to fetch dashboard metrics:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/api/user/dashboard');
      if (response.data.success) {
        const dashboardData = response.data.data || [];
        setData(dashboardData);
        calculateSummary(dashboardData);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setData([]);
      calculateSummary([]);
    }
  };

  const calculateSummary = (dashboardData) => {
    if (!Array.isArray(dashboardData) || dashboardData.length === 0) {
      setSummaryData({
        todayRequests: 0,
        todayQuota: 0,
        todayTokens: 0,
      });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayData = dashboardData.filter((item) => item.Day === today);

    const summary = {
      todayRequests: todayData.reduce(
        (sum, item) => sum + item.RequestCount,
        0
      ),
      todayQuota:
        todayData.reduce((sum, item) => sum + item.Quota, 0) / 1000000,
      todayTokens: todayData.reduce(
        (sum, item) => sum + item.PromptTokens + item.CompletionTokens,
        0
      ),
    };

    setSummaryData(summary);
  };

  // 处理数据以供折线图使用，补充缺失的日期
  const processTimeSeriesData = () => {
    const dailyData = {};

    // 获取日期范围
    const dates = data.map((item) => item.Day);
    const maxDate = new Date(); // 总是使用今天作为最后一天
    let minDate =
      dates.length > 0
        ? new Date(Math.min(...dates.map((d) => new Date(d))))
        : new Date();

    // 确保至少显示7天的数据
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // -6是因为包含今天
    if (minDate > sevenDaysAgo) {
      minDate = sevenDaysAgo;
    }

    // 生成所有日期
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dailyData[dateStr] = {
        date: dateStr,
        requests: 0,
        quota: 0,
        tokens: 0,
      };
    }

    // 填充实际数据
    data.forEach((item) => {
      dailyData[item.Day].requests += item.RequestCount;
      dailyData[item.Day].quota += item.Quota / 1000000;
      dailyData[item.Day].tokens += item.PromptTokens + item.CompletionTokens;
    });

    return Object.values(dailyData).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  };

  // 处理数据以供堆叠柱状图使用
  const processModelData = () => {
    const timeData = {};

    // 获取日期范围
    const dates = data.map((item) => item.Day);
    const maxDate = new Date(); // 总是使用今天作为最后一天
    let minDate =
      dates.length > 0
        ? new Date(Math.min(...dates.map((d) => new Date(d))))
        : new Date();

    // 确保至少显示7天的数据
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // -6是因为包含今天
    if (minDate > sevenDaysAgo) {
      minDate = sevenDaysAgo;
    }

    // 生成所有日期
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      timeData[dateStr] = {
        date: dateStr,
      };

      // 初始化所有模型的数据为0
      const models = [...new Set(data.map((item) => item.ModelName))];
      models.forEach((model) => {
        timeData[dateStr][model] = 0;
      });
    }

    // 填充实际数据
    data.forEach((item) => {
      timeData[item.Day][item.ModelName] =
        item.PromptTokens + item.CompletionTokens;
    });

    return Object.values(timeData).sort((a, b) => a.date.localeCompare(b.date));
  };

  // 获取所有唯一的模型名称
  const getUniqueModels = () => {
    return [...new Set(data.map((item) => item.ModelName))];
  };

  const timeSeriesData = processTimeSeriesData();
  const modelData = processModelData();
  const models = getUniqueModels();

  // 是否有真实用量数据（无数据时图表区渲染空态，避免大段空白）
  const hasStats = models.length > 0;
  // 某维度近 7 天是否全零（全零时趋势图叠加轻提示）
  const isSeriesEmpty = (key) =>
    !timeSeriesData.some((d) => (d[key] || 0) > 0);

  const getBarColor = (index) => {
    return ct.bars[index % ct.bars.length];
  };

  // 添加一个日期格式化函数
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    });
  };

  const axisTick = { fontSize: 12, fill: ct.axis };

  const xAxisConfig = {
    dataKey: 'date',
    axisLine: false,
    tickLine: false,
    tick: {
      ...axisTick,
      textAnchor: 'middle', // 文本居中对齐
    },
    tickFormatter: formatDate,
    interval: 0,
    minTickGap: 5,
    padding: { left: 30, right: 30 }, // 增加两侧的内边距，确保首尾标签完整显示
  };

  const tooltipStyle = {
    contentStyle: {
      background: ct.tooltipBg,
      border: ct.tooltipBorder,
      borderRadius: '8px',
      boxShadow: ct.tooltipShadow,
      color: ct.tooltipText,
      fontSize: '12px',
    },
    labelStyle: { color: ct.tooltipText },
    itemStyle: { color: ct.tooltipText },
  };

  const dateLabel = (label) =>
    `${t('dashboard.statistics.tooltip.date')}: ${formatDate(label)}`;

  const statCards = [
    {
      key: 'requests',
      icon: 'bolt',
      label: t('dashboard.stat.requests'),
      value: summaryData.todayRequests.toLocaleString(),
    },
    {
      key: 'quota',
      icon: 'dollar sign',
      label: t('dashboard.stat.quota'),
      value: `$${summaryData.todayQuota.toFixed(3)}`,
    },
    {
      key: 'tokens',
      icon: 'cube',
      label: t('dashboard.stat.tokens'),
      value: summaryData.todayTokens.toLocaleString(),
    },
    {
      key: 'rpm',
      icon: 'dashboard',
      label: t('dashboard.stat.rpm'),
      value: (metrics.rpm || 0).toLocaleString(),
    },
    {
      key: 'tpm',
      icon: 'microchip',
      label: t('dashboard.stat.tpm'),
      value: (metrics.tpm || 0).toLocaleString(),
    },
  ];

  // F8：模型维度调用分析（近 7 天 Top N，按请求量/消费额切换）
  const quotaPerUnit =
    parseFloat(localStorage.getItem('quota_per_unit')) || 500000;
  const topModels = (metrics.top_models || []).map((m) => ({
    model: m.model_name,
    requests: m.request_count,
    quota: m.quota / quotaPerUnit,
  }));
  const sortedTopModels = [...topModels].sort(
    (a, b) => (b[metricMode] || 0) - (a[metricMode] || 0)
  );
  const metricFormatter =
    metricMode === 'requests'
      ? (value) => [
          Number(value).toLocaleString(),
          t('dashboard.metrics.tooltip.requests'),
        ]
      : (value) => [
          `$${Number(value).toFixed(4)}`,
          t('dashboard.metrics.tooltip.quota'),
        ];

  return (
    <div className='dashboard-container'>
      {/* 今日指标卡 */}
      <div className='stat-row'>
        {statCards.map((card) => (
          <div className='stat-card' key={card.key}>
            <div className={`stat-icon stat-icon-${card.key}`}>
              <i className={`${card.icon} icon`}></i>
            </div>
            <div className='stat-meta'>
              <div className='stat-label'>{card.label}</div>
              <div className='stat-number'>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 三个并排的折线图 */}
      <div className='charts-grid'>
        {[
          {
            key: 'requests',
            title: t('dashboard.charts.requests.title'),
            formatter: (value) => [value, t('dashboard.charts.requests.tooltip')],
          },
          {
            key: 'quota',
            title: t('dashboard.charts.quota.title'),
            formatter: (value) => [
              value.toFixed(6),
              t('dashboard.charts.quota.tooltip'),
            ],
          },
          {
            key: 'tokens',
            title: t('dashboard.charts.tokens.title'),
            formatter: (value) => [value, t('dashboard.charts.tokens.tooltip')],
          },
        ].map((chart) => (
          <div className='chart-card' key={chart.key}>
            <div className='chart-card-header'>{chart.title}</div>
            <div className='chart-container'>
              <ResponsiveContainer width='100%' height={140}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid
                    strokeDasharray='3 3'
                    vertical={false}
                    horizontal={true}
                    stroke={ct.grid}
                  />
                  <XAxis {...xAxisConfig} />
                  <YAxis hide={true} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={chart.formatter}
                    labelFormatter={dateLabel}
                  />
                  <Line
                    type='monotone'
                    dataKey={chart.key}
                    stroke={ct.lines[chart.key]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              {isSeriesEmpty(chart.key) && (
                <div className='chart-empty-hint'>
                  {t('dashboard.empty.trend')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 模型使用统计 */}
      <div className='chart-card'>
        <div className='chart-card-header'>{t('dashboard.statistics.title')}</div>
        {hasStats ? (
          <div className='chart-container'>
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={modelData}>
                <CartesianGrid
                  strokeDasharray='3 3'
                  vertical={false}
                  stroke={ct.grid}
                />
                <XAxis {...xAxisConfig} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                />
                {/* Task3-3：禁用默认灰色 cursor rect（hover 时整条变灰大柱，显示不佳） */}
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={dateLabel}
                  cursor={false}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', color: ct.axis }} />
                {models.map((model, index) => (
                  <Bar
                    key={model}
                    dataKey={model}
                    stackId='a'
                    fill={getBarColor(index)}
                    name={model}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon='chart bar'
            title={t('dashboard.empty.stats_title')}
            description={t('dashboard.empty.stats_desc')}
          />
        )}
      </div>

      {/* F8：模型维度调用分析（近 7 天 Top 10） */}
      <div className='chart-card'>
        <div className='chart-card-header'>
          <span>
            {t('dashboard.metrics.title')}
            <span
              style={{
                marginLeft: '8px',
                fontSize: '12px',
                fontWeight: 400,
                color: ct.axis,
              }}
            >
              {t('dashboard.metrics.subtitle')}
            </span>
          </span>
          <Button.Group size='small' basic>
            <Button
              active={metricMode === 'requests'}
              onClick={() => setMetricMode('requests')}
            >
              {t('dashboard.metrics.by_requests')}
            </Button>
            <Button
              active={metricMode === 'quota'}
              onClick={() => setMetricMode('quota')}
            >
              {t('dashboard.metrics.by_quota')}
            </Button>
          </Button.Group>
        </div>
        {sortedTopModels.length > 0 ? (
          <div className='chart-container'>
            <ResponsiveContainer width='100%' height={300}>
              <BarChart
                data={sortedTopModels}
                layout='vertical'
                margin={{left: 10, right: 20, top: 4, bottom: 4}}
              >
                <CartesianGrid
                  strokeDasharray='3 3'
                  horizontal={false}
                  stroke={ct.grid}
                />
                <XAxis
                  type='number'
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                />
                <YAxis
                  type='category'
                  dataKey='model'
                  width={150}
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                />
                {/* Task3-3：禁用默认灰色 cursor rect（同上） */}
                <Tooltip
                  {...tooltipStyle}
                  formatter={metricFormatter}
                  cursor={false}
                />
                <Bar dataKey={metricMode} radius={[0, 4, 4, 0]}>
                  {sortedTopModels.map((entry, index) => (
                    <Cell key={entry.model} fill={getBarColor(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon='chart bar'
            title={t('dashboard.empty.stats_title')}
            description={t('dashboard.empty.stats_desc')}
          />
        )}
      </div>
    </div>
  );
};

export default Dashboard;

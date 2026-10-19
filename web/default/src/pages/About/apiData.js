// 关于页接口文档数据：仅包含用户通过应用/API Key 可调用的网关接口（/v1/* 已实现）
// 每个接口含：method / path / desc / params / 三语言示例
// BASE_URL = 站点地址，API_KEY = 应用/令牌 Key

export const API_SECTIONS = [
  {
    id: 'section-models',
    title: '模型接口',
    apis: [
      {
        id: 'api-list-models',
        method: 'GET',
        path: '/v1/models',
        desc: '列出当前 API Key 可用的所有模型',
        params: [],
      },
      {
        id: 'api-retrieve-model',
        method: 'GET',
        path: '/v1/models/{model}',
        desc: '获取指定模型的详细信息',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID，如 gpt-4o-mini', path: true },
        ],
      },
    ],
  },
  {
    id: 'section-chat',
    title: '对话接口',
    apis: [
      {
        id: 'api-chat-completions',
        method: 'POST',
        path: '/v1/chat/completions',
        desc: 'Chat Completions 接口，兼容 OpenAI 格式，支持流式响应（SSE）',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID' },
          { name: 'messages', type: 'array', required: true, desc: '消息数组 [{role, content}]' },
          { name: 'stream', type: 'bool', required: false, desc: '是否流式响应，默认 false' },
          { name: 'temperature', type: 'float', required: false, desc: '采样温度 0-2' },
          { name: 'max_tokens', type: 'int', required: false, desc: '最大生成 Token 数' },
          { name: 'top_p', type: 'float', required: false, desc: '核采样概率' },
          { name: 'frequency_penalty', type: 'float', required: false, desc: '频率惩罚 -2 到 2' },
          { name: 'presence_penalty', type: 'float', required: false, desc: '存在惩罚 -2 到 2' },
        ],
      },
      {
        id: 'api-completions',
        method: 'POST',
        path: '/v1/completions',
        desc: '文本补全接口（Legacy）',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID' },
          { name: 'prompt', type: 'string', required: true, desc: '提示文本' },
          { name: 'stream', type: 'bool', required: false, desc: '是否流式响应' },
          { name: 'max_tokens', type: 'int', required: false, desc: '最大生成 Token 数' },
          { name: 'temperature', type: 'float', required: false, desc: '采样温度' },
        ],
      },
      {
        id: 'api-edits',
        method: 'POST',
        path: '/v1/edits',
        desc: '文本编辑接口，根据指令修改输入文本',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID' },
          { name: 'input', type: 'string', required: false, desc: '待编辑的文本，默认为空字符串' },
          { name: 'instruction', type: 'string', required: true, desc: '编辑指令' },
          { name: 'temperature', type: 'float', required: false, desc: '采样温度' },
          { name: 'top_p', type: 'float', required: false, desc: '核采样概率' },
        ],
      },
    ],
  },
  {
    id: 'section-embedding',
    title: '向量接口',
    apis: [
      {
        id: 'api-embeddings',
        method: 'POST',
        path: '/v1/embeddings',
        desc: '生成文本的向量嵌入',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID' },
          { name: 'input', type: 'string|array', required: true, desc: '输入文本或文本数组' },
          { name: 'encoding_format', type: 'string', required: false, desc: '编码格式：float | base64' },
        ],
      },
    ],
  },
  {
    id: 'section-image',
    title: '图像接口',
    apis: [
      {
        id: 'api-image-generations',
        method: 'POST',
        path: '/v1/images/generations',
        desc: '根据提示词生成图像',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID，如 dall-e-3' },
          { name: 'prompt', type: 'string', required: true, desc: '图像描述提示词' },
          { name: 'n', type: 'int', required: false, desc: '生成数量，默认 1' },
          { name: 'size', type: 'string', required: false, desc: '图像尺寸，如 1024x1024' },
          { name: 'quality', type: 'string', required: false, desc: '图像质量：standard | hd' },
          { name: 'response_format', type: 'string', required: false, desc: '返回格式：url | b64_json' },
        ],
      },
    ],
  },
  {
    id: 'section-audio',
    title: '语音接口',
    apis: [
      {
        id: 'api-audio-transcriptions',
        method: 'POST',
        path: '/v1/audio/transcriptions',
        desc: '语音转文本（需 multipart/form-data 上传音频文件）',
        params: [
          { name: 'file', type: 'file', required: true, desc: '音频文件' },
          { name: 'model', type: 'string', required: true, desc: '模型 ID，如 whisper-1' },
          { name: 'language', type: 'string', required: false, desc: '音频语言（ISO-639-1）' },
          { name: 'prompt', type: 'string', required: false, desc: '引导文本' },
          { name: 'response_format', type: 'string', required: false, desc: '返回格式：json | text | srt | verbose_json | vtt' },
          { name: 'temperature', type: 'float', required: false, desc: '采样温度' },
        ],
      },
      {
        id: 'api-audio-translations',
        method: 'POST',
        path: '/v1/audio/translations',
        desc: '将音频翻译为英文文本',
        params: [
          { name: 'file', type: 'file', required: true, desc: '音频文件' },
          { name: 'model', type: 'string', required: true, desc: '模型 ID' },
          { name: 'prompt', type: 'string', required: false, desc: '引导文本' },
          { name: 'response_format', type: 'string', required: false, desc: '返回格式' },
          { name: 'temperature', type: 'float', required: false, desc: '采样温度' },
        ],
      },
      {
        id: 'api-audio-speech',
        method: 'POST',
        path: '/v1/audio/speech',
        desc: '文本转语音',
        params: [
          { name: 'model', type: 'string', required: true, desc: '模型 ID，如 tts-1' },
          { name: 'input', type: 'string', required: true, desc: '要合成的文本' },
          { name: 'voice', type: 'string', required: true, desc: '音色：alloy | echo | fable | onyx | nova | shimmer' },
          { name: 'response_format', type: 'string', required: false, desc: '音频格式：mp3 | opus | aac | flac' },
          { name: 'speed', type: 'float', required: false, desc: '语速 0.25 - 4.0' },
        ],
      },
    ],
  },
  {
    id: 'section-moderation',
    title: '内容审核',
    apis: [
      {
        id: 'api-moderations',
        method: 'POST',
        path: '/v1/moderations',
        desc: '检查文本是否违反内容安全策略',
        params: [
          { name: 'input', type: 'string|array', required: true, desc: '待检查的文本' },
          { name: 'model', type: 'string', required: false, desc: '审核模型 ID' },
        ],
      },
    ],
  },
];

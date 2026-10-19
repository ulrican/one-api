import React, { useMemo } from 'react';
import { marked } from 'marked';

// Task4-9 模型体验：模型返回内容（含 SSE 流式分片）的 Markdown 渲染。
// marked v4 为单例，options 随 parse 调用传入，不修改全局配置（Home/About 保持默认）。
const Markdown = ({ content = '', className = '' }) => {
  const html = useMemo(() => {
    if (!content) return '';
    try {
      // gfm：表格/删除线等；breaks：单换行转 <br>（聊天场景）；
      // 流式过程中未闭合代码块等 marked 可容错输出
      return marked.parse(content, { gfm: true, breaks: true }) || '';
    } catch (e) {
      return content;
    }
  }, [content]);

  return (
    <div
      className={`exp-md${className ? ` ${className}` : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default Markdown;

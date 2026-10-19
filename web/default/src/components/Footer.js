import React, { useEffect, useState } from 'react';
import { Container, Segment } from 'semantic-ui-react';
import { getFooterHTML } from '../helpers';

const Footer = () => {
  const [footer, setFooter] = useState(getFooterHTML());
  let remainCheckTimes = 5;

  const loadFooter = () => {
    let footer_html = localStorage.getItem('footer_html');
    if (footer_html) {
      setFooter(footer_html);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (remainCheckTimes <= 0) {
        clearInterval(timer);
        return;
      }
      remainCheckTimes--;
      loadFooter();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Segment vertical className='app-footer'>
      <Container textAlign='center'>
        {footer ? (
          <div
            className='custom-footer'
            dangerouslySetInnerHTML={{ __html: footer }}
          ></div>
        ) : null}
        {/* 法定备案信息：无论是否自定义 footer 均恒显示；默认开源署名信息不再展示 */}
        <div className='app-footer-beian'>
          <span className='app-footer-beian-item'>
            © 2026 智航易飞（珠海）科技有限公司
          </span>
          <a
            className='app-footer-beian-item'
            href='https://beian.miit.gov.cn/'
            target='_blank'
            rel='noreferrer'
          >
            粤ICP备2026086533号
          </a>
          <a
            className='app-footer-beian-item'
            href='https://beian.mps.gov.cn/#/query/webSearch?code=44049002001289'
            target='_blank'
            rel='noreferrer'
          >
            <img
              src='/images/ghs.png'
              alt='公安备案徽章'
              style={{ height: '14px', verticalAlign: '-2px', marginRight: '3px' }}
            />
            粤公网安备44049002001289号
          </a>
        </div>
      </Container>
    </Segment>
  );
};

export default Footer;

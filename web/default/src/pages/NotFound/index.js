import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../../context/User';

const NotFound = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const loggedIn = !!userState.user;

  return (
    <div className='nf-page'>
      <div className='nf-code'>404</div>
      <h2 className='nf-title'>{t('notfound.title')}</h2>
      <p className='nf-desc'>{t('notfound.description')}</p>
      <div className='nf-actions'>
        <Button primary className='nf-btn' onClick={() => navigate('/')}>
          {t('notfound.back_home')}
        </Button>
        {loggedIn && (
          <Button
            basic
            className='nf-btn'
            onClick={() => navigate('/dashboard')}
          >
            {t('notfound.back_console')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default NotFound;

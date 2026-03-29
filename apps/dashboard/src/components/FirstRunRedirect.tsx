import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Fleet } from '../pages/Fleet.js';

export function FirstRunRedirect() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch('/v1/setup/status')
      .then((res) => res.json())
      .then((data: { isFirstRun: boolean }) => {
        if (data.isFirstRun) {
          navigate('/setup', { replace: true });
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [navigate]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return <Fleet />;
}

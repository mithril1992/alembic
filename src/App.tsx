import { HashRouter, Route, Routes } from 'react-router-dom';
import { MainView } from './ui/components/MainView.tsx';

// GitHub Pages はパスを直接叩かれると 404 を返すため、ハッシュルータを使う（SPEC.md 2章）。
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainView />} />
      </Routes>
    </HashRouter>
  );
}

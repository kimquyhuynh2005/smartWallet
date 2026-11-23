import { Navigate, Route, Routes } from 'react-router-dom';
import WalletDetail from './WalletDetail';
import WalletsList from './WalletsList';

/** /wallets (WAL-01 list, create, edit, archive, delete) · /wallets/:id (detail) */
export default function WalletsPage() {
  return (
    <Routes>
      <Route index element={<WalletsList />} />
      <Route path=":id" element={<WalletDetail />} />
      <Route path="*" element={<Navigate to="/wallets" replace />} />
    </Routes>
  );
}

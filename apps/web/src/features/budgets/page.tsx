import { Navigate, Route, Routes } from 'react-router-dom';
import CategoryDetail from './CategoryDetail';
import Overview from './Overview';

/** mounted at budgets/*: /budgets (total + categories) and /budgets/category/:categoryId (detail with its transactions) */
export default function BudgetsPage() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="category/:categoryId" element={<CategoryDetail />} />
      <Route path="*" element={<Navigate to="/budgets" replace />} />
    </Routes>
  );
}

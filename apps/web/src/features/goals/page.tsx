import { Navigate, Route, Routes } from 'react-router-dom';
import GoalDetail from './GoalDetail';
import GoalsList from './GoalsList';

/** mounted at goals/*: /goals (cards) and /goals/:id (detail with contribution history) */
export default function GoalsPage() {
  return (
    <Routes>
      <Route index element={<GoalsList />} />
      <Route path=":id" element={<GoalDetail />} />
      <Route path="*" element={<Navigate to="/goals" replace />} />
    </Routes>
  );
}

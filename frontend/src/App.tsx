import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './layouts/DashboardLayout'
import { CoordinatorDashboard } from './pages/CoordinatorDashboard'
import { DepartmentSimulator } from './pages/DepartmentSimulator'
import { DoctorConsole } from './pages/DoctorConsole'
import { PatientSimulator } from './pages/PatientSimulator'

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate replace to="/doctor" />} />
        <Route path="/doctor" element={<DoctorConsole />} />
        <Route path="/coordinator" element={<CoordinatorDashboard />} />
        <Route path="/patient" element={<PatientSimulator />} />
        <Route path="/departments" element={<DepartmentSimulator />} />
        <Route path="*" element={<Navigate replace to="/doctor" />} />
      </Route>
    </Routes>
  )
}

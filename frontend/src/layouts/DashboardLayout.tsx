import {
  Activity,
  ClipboardPlus,
  HeartPulse,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Radio,
  Stethoscope,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Badge } from '../components/common/Badge'

const navigation = [
  { to: '/doctor', label: 'Doctor Console', icon: ClipboardPlus },
  { to: '/coordinator', label: 'Coordinator', icon: PanelsTopLeft },
  { to: '/patient', label: 'Patient WhatsApp Simulator', icon: MessageCircle },
  { to: '/departments', label: 'Departments', icon: Stethoscope },
]

const pageTitles: Record<string, string> = {
  '/doctor': 'Doctor Console',
  '/coordinator': 'Coordinator Dashboard',
  '/patient': 'Patient WhatsApp Simulator',
  '/departments': 'Department Simulator',
}

export function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? 'CareLoop'

  return (
    <div className={`app-shell${isCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`sidebar${menuOpen ? ' sidebar--open' : ''}${isCollapsed ? ' sidebar--collapsed' : ''}`}
      >
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <HeartPulse size={21} strokeWidth={2.2} />
          </div>
          <div>
            <span className="brand__name">CareLoop</span>
            <span className="brand__caption">CARE OPERATIONS</span>
          </div>
          <button
            className="icon-button sidebar__close"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="sidebar__section-label">WORKSPACE</div>
        <nav
          className="sidebar__nav"
          id="primary-navigation"
          aria-label="Main navigation"
        >
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              title={isCollapsed ? label : undefined}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `nav-link${isActive ? ' nav-link--active' : ''}`
              }
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__spacer" />
        <div className="sidebar__section-label">SYSTEM STATUS</div>
        <div className="system-status">
          <div className="system-status__row">
            <span className="system-status__icon">
              <Activity size={15} />
            </span>
            <span>Backend status</span>
            <Badge>Not verified</Badge>
          </div>
          <div className="system-status__row">
            <span className="system-status__icon">
              <Radio size={15} />
            </span>
            <span>Realtime</span>
            <Badge>Not configured</Badge>
          </div>
          <p className="system-status__note">
            No backend connection check has been performed.
          </p>
        </div>
        <div className="sidebar__footer">
          <span className="sidebar__footer-dot" />
          <span>Frontend foundation</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button topbar__menu"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar__crumb">
            <button
              className="icon-button sidebar__collapse topbar__collapse"
              type="button"
              aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-controls="primary-navigation"
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            >
              {isCollapsed ? (
                <PanelLeftOpen size={17} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={17} aria-hidden="true" />
              )}
            </button>
            <span className="topbar__product">CareLoop</span>
            <span className="topbar__separator">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar__right">
            <Badge tone="teal">
              <span className="status-dot" />
              Demo workspace
            </Badge>
            <div className="topbar__avatar" aria-label="User not signed in">
              <HeartPulse size={17} />
            </div>
          </div>
        </header>
        <main className="page-content">
          <div className="route-transition" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

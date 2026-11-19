import React, { useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AdminContext } from '../context/AdminContext'
import { DoctorContext } from '../context/DoctorContext'

const ADMIN_PATH_PREFIXES = [
  '/admin-dashboard',
  '/all-appointments',
  '/add-doctor',
  '/doctor-list',
  '/patients-list'
]

const DOCTOR_PATH_PREFIXES = [
  '/doctor-dashboard',
  '/doctor-appointments',
  '/doctor-chat',
  '/doctor-profile',
  '/doctor-video-call',
  '/doctor-prescription'
]

const matchesPrefix = (pathname, prefixes) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/**
 * Validates that a redirect target is a safe internal path and matches the authenticated role.
 */
export const getSafeAdminRedirectPath = (rawPath, role, fallback = '/') => {
  if (typeof rawPath !== 'string') return fallback
  const trimmed = rawPath.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback
  if (trimmed === '/login' || trimmed.startsWith('/login?') || trimmed.startsWith('/login/')) {
    return fallback
  }

  const pathname = trimmed.split('?')[0].split('#')[0]
  if (pathname === '/') return trimmed
  if (role === 'admin' && matchesPrefix(pathname, ADMIN_PATH_PREFIXES)) return trimmed
  if (role === 'doctor' && matchesPrefix(pathname, DOCTOR_PATH_PREFIXES)) return trimmed
  return fallback
}

export const buildAdminLoginRedirectTarget = (location) => {
  const fullPath = `${location?.pathname || ''}${location?.search || ''}${location?.hash || ''}`
  if (
    !fullPath ||
    fullPath === '/' ||
    !fullPath.startsWith('/') ||
    fullPath.startsWith('//') ||
    fullPath === '/login' ||
    fullPath.startsWith('/login?') ||
    fullPath.startsWith('/login/')
  ) {
    return '/login'
  }
  return `/login?redirect=${encodeURIComponent(fullPath)}`
}

export const UnauthRedirect = () => {
  const location = useLocation()
  const from = `${location.pathname}${location.search}${location.hash}`
  return (
    <Navigate
      to={buildAdminLoginRedirectTarget(location)}
      state={{ from }}
      replace
    />
  )
}

export const AdminRoute = ({ children }) => {
  const { aToken } = useContext(AdminContext)
  const { dToken } = useContext(DoctorContext)
  const location = useLocation()

  if (!aToken) {
    if (dToken) return <Navigate to='/doctor-dashboard' replace />
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={buildAdminLoginRedirectTarget(location)} state={{ from }} replace />
  }

  return children
}

export const DoctorRoute = ({ children }) => {
  const { aToken } = useContext(AdminContext)
  const { dToken } = useContext(DoctorContext)
  const location = useLocation()

  if (!dToken) {
    if (aToken) return <Navigate to='/admin-dashboard' replace />
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={buildAdminLoginRedirectTarget(location)} state={{ from }} replace />
  }

  return children
}

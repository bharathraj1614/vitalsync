import React, { useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

/**
 * Validates that a post-login redirect target is an internal relative path
 * (preventing open redirects and login-loop redirects).
 */
export const getSafeRedirectPath = (rawPath, fallback = '/') => {
  if (typeof rawPath !== 'string') return fallback
  const trimmed = rawPath.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback
  if (trimmed === '/login' || trimmed.startsWith('/login?') || trimmed.startsWith('/login/')) {
    return fallback
  }
  return trimmed
}

/**
 * Builds `/login?redirect=...` preserving the requested path, query, and hash.
 */
export const buildLoginRedirectTarget = (location) => {
  const fullPath = `${location?.pathname || ''}${location?.search || ''}${location?.hash || ''}`
  const safeFrom = getSafeRedirectPath(fullPath, '')
  if (!safeFrom || safeFrom === '/') return '/login'
  return `/login?redirect=${encodeURIComponent(safeFrom)}`
}

const ProtectedRoute = ({ children }) => {
  const { token } = useContext(AppContext)
  const location = useLocation()

  if (!token) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return (
      <Navigate
        to={buildLoginRedirectTarget(location)}
        state={{ from }}
        replace
      />
    )
  }

  return children
}

export default ProtectedRoute

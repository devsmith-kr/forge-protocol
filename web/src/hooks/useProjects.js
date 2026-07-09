// useProjects.js - Supabase 프로젝트 CRUD + 상태 저장/로드 (Phase B)
//
// RLS 로 유저는 자기 프로젝트만 접근 가능 (supabase/schema.sql 참고).
// state 컬럼은 usePersistedState 의 toStatePayload 결과(JSONB)를 그대로 담는다.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProjects(userId) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!userId || !supabase) {
      setProjects([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .select('id,name,updated_at')
      .order('updated_at', { ascending: false })
    if (err) setError(err.message)
    else setProjects(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createProject = useCallback(
    async (name, state) => {
      const { data, error: err } = await supabase
        .from('projects')
        .insert({ name, state, user_id: userId })
        .select('id,name,updated_at')
        .single()
      if (err) throw err
      await refresh()
      return data
    },
    [userId, refresh],
  )

  const renameProject = useCallback(
    async (id, name) => {
      const { error: err } = await supabase.from('projects').update({ name }).eq('id', id)
      if (err) throw err
      await refresh()
    },
    [refresh],
  )

  const deleteProject = useCallback(
    async (id) => {
      const { error: err } = await supabase.from('projects').delete().eq('id', id)
      if (err) throw err
      await refresh()
    },
    [refresh],
  )

  const loadProject = useCallback(async (id) => {
    const { data, error: err } = await supabase
      .from('projects')
      .select('id,name,state')
      .eq('id', id)
      .single()
    if (err) throw err
    return data
  }, [])

  const saveProjectState = useCallback(async (id, state) => {
    const { error: err } = await supabase
      .from('projects')
      .update({ state, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
  }, [])

  return {
    projects,
    loading,
    error,
    refresh,
    createProject,
    renameProject,
    deleteProject,
    loadProject,
    saveProjectState,
  }
}

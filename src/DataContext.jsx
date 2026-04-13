import { createContext, useContext, useEffect, useState } from 'react'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from './firebase'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const q = query(collection(db, 'canal_ne135'), orderBy('datetime'))
        const snap = await getDocs(q)
        setRecords(snap.docs.map((d) => d.data()))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <DataContext.Provider value={{ records, loading, error }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  return useContext(DataContext)
}

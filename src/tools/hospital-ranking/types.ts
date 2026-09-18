export type HospitalGrade = 'A++++' | 'A+++' | 'A++' | 'A+' | 'A'

export interface HospitalEntry {
  grade: HospitalGrade
  name: string
}

export interface HospitalRankingSnapshot {
  year: number
  years: number[]
  note: string
  source: string
  hospitals: HospitalEntry[]
  fetchedAt: string
}

export const GRADE_ORDER: HospitalGrade[] = ['A++++', 'A+++', 'A++', 'A+', 'A']

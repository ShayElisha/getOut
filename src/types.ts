export type Intensity = 'easy' | 'medium' | 'hard'
export type WorkerStatus = 'active' | 'inactive'
export type ShiftType = 'morning' | 'afternoon' | 'night'

export interface Worker {
  id: string
  fullName: string
  phone: string
  certifications: string[]
  status: WorkerStatus
  /** Can log in to the system with phone (no OTP for now) */
  isManager: boolean
}

export interface Lane {
  id: string
  name: string
  staffingStandard: 1 | 2
  /** Worker must hold all listed certifications */
  requiredCertifications: string[]
  intensity: Intensity
}

export interface LaneAssignment {
  laneId: string
  workerIds: string[]
}

export interface ShiftSchedule {
  id: string
  date: string
  shiftType: ShiftType
  activeLaneIds: string[]
  presentWorkerIds: string[]
  assignments: LaneAssignment[]
  createdAt: string
  updatedAt: string
}

export interface AppData {
  workers: Worker[]
  lanes: Lane[]
  history: ShiftSchedule[]
  /** Known certification labels used across the app */
  certificationsCatalog: string[]
}

export type View =
  | 'home'
  | 'shift'
  | 'workers'
  | 'lanes'
  | 'history'
  | 'certs'

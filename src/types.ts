export interface Estado {
  id: number
  sigla: string
  nome: string
  regiao: {
    id: number
    sigla: string
    nome: string
  }
}

export interface Municipio {
  id: number
  nome: string
}

export interface MunicipioWithEstado {
  id: number
  nome: string
  estadoId: number
  estadoSigla: string
  estadoNome: string
}

export type CitySearchValue =
  | { kind: 'estado'; data: Estado }
  | { kind: 'municipio'; data: MunicipioWithEstado }

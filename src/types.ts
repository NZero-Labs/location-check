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

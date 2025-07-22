import axios from "axios"

export const getCoinPrice = async (coin) => {
  try {
    coin = coin.toUpperCase()
    const response = await axios.get(`https://economia.awesomeapi.com.br/json/last/${coin}-BRL`)
    const data = response.data
    const price = data[coin+"BRL"].ask
    return {text: `O preço da moeda ${coin} é: R$ ${parseFloat(price).toFixed(2)}`}
  } catch (error) {
    console.log(error)
    return {text: `Moeda ${coin} não encontrada`, error: true}
  }
}
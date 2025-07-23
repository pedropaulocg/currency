import axios from "axios"

export const getCoinPrice = async (coin) => {
  try {
    coin = coin.toUpperCase()
    const response = await axios.get(`https://api.frankfurter.app/latest?from=${coin}&to=BRL`)
    const data = response.data
    const price = data.rates.BRL
    return {text: `O preço da moeda ${coin} é: R$ ${parseFloat(price).toFixed(2)}`}
  } catch (error) {
    console.log(error)
    return {text: `Moeda ${coin} não encontrada`, error: true}
  }
}
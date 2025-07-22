
import UserWatcher from "./UserWatcher.js"
import { getCoinPrice } from "./getCoinPrice.js"

export const steps = [
  {id: 1,
  message: "Ola, sou bot das moedas, como posso te ajudar? Para saber o preço de uma moeda em real, digite o nome da moeda, por exemplo: USD, BRL, EUR, etc.\n Para entrar na lista de alertas de uma moeda digite /entrar\n Para visualizar suas listas digite /listas",
  actions: ["/entrar", "/listas"],
  next: (m) => m == '/entrar' ? 3 : 9
  },
  {id: 3,
    message: "*Primeiro passo*\nDigite o nome da moeda, por exemplo: USD, BRL, EUR, etc.",
    next: 4
  },
  {id: 4,
    message: "*Segundo passo*\nDigite o valor que deseja ser alertado, por exemplo: R$ 5,00",
    next: 5
  },
  {id: 5,
    message: "Voce sera alertado quando o preço da moeda {coin} for igual ou menor que o valor {value} e tambem as 8h 12h e 18h. Confirma? 1 - Sim, 2 - Não",
    actions: ["1", "2"],
    next: (m) => m == "1" ? 6 : 8
  },
  {id: 6,
    message: "Feito! Agora voce sera alertado quando o preço da moeda {coin} for igual ou menor que o valor {value}.",
    next: 8
  },
  {
    id: 8,
    message: "Para saber o preço de uma moeda em real, digite o nome da moeda, por exemplo: USD, BRL, EUR, etc.\n Para entrar na lista de moedas digite /entrar\n Para visualizar suas listas digite /listas",
    actions: ["/entrar", "/listas"],
    next: (m) => m == '/entrar' ? 3 : 9
  },
  {
    id: 9,
    message: "Listas:",
    next: 8
  }
]

const userWatcherHelper = []

export const handleChatBot = async (message, user) => {
  if (user.step === undefined) {
    user.step = steps[0]
    return {text: user.step.message}
  }
  if (user.step.id === 1 || user.step.id === 8) {
    if (message.body === "/entrar") {
      user.step = getStepById(user.step.next(message.body))
      return {text: user.step.message}
    } else if (message.body === "/listas") {
      user.step = getStepById(user.step.next)
      const listOfWatchers = await getListOfWatchers(user)
      return {text: "Suas listas"+ "\n" + listOfWatchers.map(watcher => watcher.coin + " - " + watcher.price).join("\n")}
    }
    const response = await getCoinPrice(message.body)
    return {text: response.text}
  }
  if (user.step.id === 3) {
    const coin = message.body
    const response = await getCoinPrice(coin)
    if (response.error) {
      return {text: "Moeda invalida"}
    }
    await handleEnterCoinWatcher(coin, undefined, user)
    user.step = getStepById(user.step.next)
    return {text: user.step.message}
  }
  if (user.step.id === 4) {
    let price = message.body
    price = price.replace("R$", "").replace(",", ".")
    await handleEnterCoinWatcher(undefined, price, user)
    user.step = getStepById(user.step.next)
    const getHelper = userWatcherHelper.findIndex(watcher => watcher.userId === user.id)
    const responseMessage = user.step.message.replace("{coin}", userWatcherHelper[getHelper].coin).replace("{value}", userWatcherHelper[getHelper].price)
    return {text: responseMessage}
  }
  if (user.step.id === 5) {
    const confirm = message.body
    if (confirm === "1") {
      handleEnterCoinWatcher(undefined, undefined, user)
      user.step = getStepById(user.step.next(1))
      const getHelper = userWatcherHelper.findIndex(watcher => watcher.userId === user.id)
      console.log(user.step)
      const responseMessage = user.step.message.replace("{coin}", userWatcherHelper[getHelper].coin).replace("{value}", userWatcherHelper[getHelper].price)
      userWatcherHelper.splice(getHelper, 1)
      user.step = getStepById(user.step.next)
      return {text: responseMessage}
    } else if (confirm === "2") {
      const getHelper = userWatcherHelper.findIndex(watcher => watcher.userId === user.id)
      userWatcherHelper.splice(getHelper, 1)
      user.step = getStepById(user.step.next(2))

      return {text: "Ação cancelada"}
    }
  }
  return {text: "Não foi possível encontrar o passo"};
}



const handleEnterCoinWatcher = async (coin, price, user) => {
  const getHelper = userWatcherHelper.findIndex(watcher => watcher.userId === user.id)
  if (!coin && !price) {
    await UserWatcher.create({
      userId: user.id,
      coin: userWatcherHelper[getHelper].coin,
      price: userWatcherHelper[getHelper].price
    })
    return
  }
  if (getHelper !== -1) {
    userWatcherHelper[getHelper].price = price
  } else {
    const newUserWatcher = {
      userId: user.id,
      coin: coin.toUpperCase(),
    }

    userWatcherHelper.push(newUserWatcher)
    return
  }
}

const getStepById = (id) => {
  return steps.find(step => step.id === id)
}

const getListOfWatchers = async (user) => {
  const watchers = await UserWatcher.find({userId: user.id})
  return watchers
}
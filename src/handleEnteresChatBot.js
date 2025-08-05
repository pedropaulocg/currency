
import UserWatcher from "./UserWatcher.js"
import { getCoinPrice } from "./getCoinPrice.js"

export const steps = [
  {id: 1,
  message: "Ola, sou bot das moedas, como posso te ajudar? Para saber o preço de uma moeda em real, digite o nome da moeda, por exemplo: USD, BRL, EUR, etc.\n Para entrar na lista de alertas de uma moeda digite /entrar\n Para visualizar suas listas digite /listas\n Para editar suas listas digite /editar",
  actions: ["/entrar", "/listas", "/editar"],
  next: (m) => {
    if (m === '/entrar') return 3;
    if (m === '/listas') return 8;
    if (m === '/editar') return 10;
    return 1;
  }
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
    message: "Para saber o preço de uma moeda em real, digite o nome da moeda, por exemplo: USD, BRL, EUR, etc.\n Para entrar na lista de moedas digite /entrar\n Para visualizar suas listas digite /listas\n Para editar suas listas digite /editar",
    actions: ["/entrar", "/listas", "/editar"],
    next: (m) => {
      if (m === '/entrar') return 3;
      if (m === '/listas') return 8;
      if (m === '/editar') return 10;
      return 8;
    }
  },
  {
    id: 9,
    message: "Listas:",
    next: 8
  },
  {
    id: 10,
    message: "Digite o número da lista que deseja editar:",
    next: 11
  },
  {
    id: 11,
    message: "Digite o novo valor para {coin}:",
    next: 12
  },
  {
    id: 12,
    message: "Valor atualizado! O novo valor para {coin} é R$ {value}.",
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
      user.step = getStepById(user.step.next(message.body))
      const listOfWatchers = await getListOfWatchers(user)
      if (listOfWatchers.length === 0) {
        return {text: "Você não tem nenhuma lista de alertas criada ainda."}
      }
      const listText = listOfWatchers.map((watcher, index) => 
        `${index + 1}. ${watcher.coin} - R$ ${watcher.price}`
      ).join("\n");
      return {text: "Suas listas:\n" + listText}
    } else if (message.body === "/editar") {
      const listOfWatchers = await getListOfWatchers(user)
      if (listOfWatchers.length === 0) {
        return {text: "Você não tem nenhuma lista de alertas para editar."}
      }
      user.step = getStepById(user.step.next(message.body))
      const listText = listOfWatchers.map((watcher, index) => 
        `${index + 1}. ${watcher.coin} - R$ ${watcher.price}`
      ).join("\n");
      return {text: "Digite o número da lista que deseja editar:\n" + listText}
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
    
    // Check if user already has a watcher for this coin
    const existingWatcher = await UserWatcher.findOne({userId: user.id, coin: coin.toUpperCase()})
    if (existingWatcher) {
      await handleEnterCoinWatcher(coin, undefined, user)
      user.step = getStepById(user.step.next)
      return {text: `⚠️ Você já tem um alerta para ${coin.toUpperCase()}. O valor atual será substituído pelo novo valor.\n\n${user.step.message}`}
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
      const getHelper = userWatcherHelper.findIndex(watcher => watcher.userId === user.id)
      const helper = userWatcherHelper[getHelper]
      
      await handleEnterCoinWatcher(undefined, undefined, user)
      user.step = getStepById(user.step.next(1))
      
      console.log(user.step)
      const responseMessage = user.step.message.replace("{coin}", helper.coin).replace("{value}", helper.price)
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
  if (user.step.id === 10) {
    const listNumber = parseInt(message.body)
    const listOfWatchers = await getListOfWatchers(user)
    
    if (isNaN(listNumber) || listNumber < 1 || listNumber > listOfWatchers.length) {
      return {text: "Número inválido. Digite um número válido da lista."}
    }
    
    const selectedWatcher = listOfWatchers[listNumber - 1]
    user.step = getStepById(user.step.next)
    user.step.selectedWatcher = selectedWatcher
    return {text: user.step.message.replace("{coin}", selectedWatcher.coin)}
  }
  if (user.step.id === 11) {
    let newPrice = message.body
    newPrice = newPrice.replace("R$", "").replace(",", ".")
    
    if (isNaN(newPrice) || parseFloat(newPrice) <= 0) {
      return {text: "Valor inválido. Digite um valor válido, por exemplo: R$ 5,00"}
    }
    
    const selectedWatcher = user.step.selectedWatcher
    await UserWatcher.findByIdAndUpdate(selectedWatcher._id, {price: parseFloat(newPrice)})
    
    user.step = getStepById(user.step.next)
    const responseMessage = user.step.message.replace("{coin}", selectedWatcher.coin).replace("{value}", newPrice)
    user.step = getStepById(user.step.next)
    return {text: responseMessage}
  }
  return {text: "Não foi possível encontrar o passo"};
}

const handleEnterCoinWatcher = async (coin, price, user) => {
  const getHelper = userWatcherHelper.findIndex(watcher => watcher.userId === user.id)
  
  if (!coin && !price) {
    if (getHelper === -1) {
      console.error('No helper found for user:', user.id);
      return;
    }
    
    const helper = userWatcherHelper[getHelper];
    if (!helper) {
      console.error('Helper is undefined for user:', user.id);
      return;
    }
    
    const existingWatcher = await UserWatcher.findOne({userId: user.id, coin: helper.coin})
    if (existingWatcher) {
      await UserWatcher.findByIdAndUpdate(existingWatcher._id, {
        price: helper.price
      })
    } else {
      await UserWatcher.create({
        userId: user.id,
        coin: helper.coin,
        price: helper.price
      })
    }
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
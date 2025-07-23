import { sock } from "./index.js"


export const handleSendMessage = async (watcher, price, isAlert = false) => {
  try {
    const time = getTimeGreeting()
    const message = `${isAlert ? '🚨' : time} ${price}`
    const response = {text: message}
    return await sock.sendMessage(watcher.userId, response)
  } catch (error) {
    console.log(error)
    return false
  }
}

const getTimeGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia, '
  if (hour < 18) return 'Boa tarde, '
  return 'Boa noite, '
}
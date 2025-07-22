import { sock } from "./index.js"


export const handleSendMessage = async (watcher, price, greeting) => {
  try {
    const greetings = ['Bom dia, ', 'Boa tarde, ', 'Boa noite, ']
    const message = `${greetings[greeting]} ${price}`
    const response = {text: message}
    await sock.sendMessage(watcher.userId, response)
  } catch (error) {
    console.log(error)
  }
}
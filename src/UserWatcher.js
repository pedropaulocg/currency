const mongoose = require('mongoose');

const UserWatcherSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  coin: { type: String, required: true },
  price: { type: Number, required: true }
});

const UserWatcher = mongoose.model('UserWatcher', UserWatcherSchema);

module.exports = UserWatcher;

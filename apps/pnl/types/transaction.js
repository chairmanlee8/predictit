class Transaction {
  constructor({
    market,
    contract,
    dateExecuted,
    type,
    shares,
    price,
    profitLoss,
    fees,
    risk,
    creditDebit
  }) {
    this.market = market;
    this.contract = contract;
    this.dateExecuted = dateExecuted;
    this.type = type;
    this.shares = shares;
    this.price = price;
    this.profitLoss = profitLoss;
    this.fees = fees;
    this.risk = risk;
    this.creditDebit = creditDebit;
  }

  static ascending(t1, t2) {
    return t1.dateExecuted - t2.dateExecuted;
  }
}

module.exports = Transaction;

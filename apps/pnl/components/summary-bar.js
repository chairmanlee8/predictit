const Transaction = require('@app/types/transaction');

function totalProfitLoss(transactions) {
  return _.sumBy(transactions, t => t.profitLoss);
}

function totalFees(transactions) {
  return _.sumBy(transactions, t => t.fees);
}

function firstTransactionDate(transactions) {
  return _.minBy(transactions, t => t.dateExecuted).dateExecuted;
}

function lastTransactionDate(transactions) {
  return _.maxBy(transactions, t => t.dateExecuted).dateExecuted;
}

class SummaryBar {
  constructor(domElement, transactions) {
    this.uiTotalProfitLoss = domElement.querySelector('#total-pnl');
    this.uiTotalFees = domElement.querySelector('#total-fees');
    this.uiNetProfitLoss = domElement.querySelector('#total-pnl-after-fees');
    this.uiFirstTransactionDate = domElement.querySelector(
      '#first-transaction-date'
    );
    this.uiLastTransactionDate = domElement.querySelector(
      '#last-transaction-date'
    );
    this.update(transactions);
  }

  update(transactions) {
    this.uiTotalProfitLoss.innerHTML = totalProfitLoss(transactions).toFixed(2);
    this.uiTotalFees.innerHTML = totalFees(transactions).toFixed(2);
    this.uiNetProfitLoss.innerHTML = (
      totalProfitLoss(transactions) + totalFees(transactions)
    ).toFixed(2);
    this.uiFirstTransactionDate.innerHTML = firstTransactionDate(
      transactions
    ).toLocaleDateString('en-US');
    this.uiLastTransactionDate.innerHTML = lastTransactionDate(
      transactions
    ).toLocaleDateString('en-US');
  }
}

module.exports = SummaryBar;

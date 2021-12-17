import math


class Bracket:
    def __init__(self, name, lo=0, hi=1_000_000, bid=None, ask=None, last=None):
        self.name = name
        self.lo = lo
        self.hi = hi
        self.bid = bid
        self.ask = ask
        self.last = last


class Market:
    def __init__(self, name, handle, brackets):
        self.name = name
        self.handle = handle
        self.brackets = brackets


class Prediction:
    def __init__(self, stamp_time, prediction_time, prediction, debug_info={}):
        self.stamp_time = stamp_time
        self.prediction_time = prediction_time
        self.prediction = prediction  # dict: bracket name -> probability
        self.debug_info = debug_info

const AsciiTable = require('ascii-table');
const crypto = require('crypto');
const readline = require('readline');

class Dice {
  constructor(faces) {
    this.faces = faces;
    this.numFaces = faces.length;
  }

  getFace(index) {
    return this.faces[index % this.numFaces];
  }
}

class DiceParser {
  static parseDice(args) {
    if (args.length < 3) {
      throw new Error('You need at least 3 dice. Example: node dice_game.js 2,2,4,4,9,9 6,8,1,1,8,6 7,5,3,7,5,3');
    }

    let dice = [];
    for (let arg of args) {
      try {
        let faces = arg.split(',').map(num => {
          let parsed = parseInt(num);
          if (isNaN(parsed)) throw new Error('Not a number: ' + num);
          return parsed;
        });
        if (faces.length === 0) throw new Error('Each die needs at least one face!');
        dice.push(new Dice(faces));
      } catch (e) {
        throw new Error('Bad die format: \'' + arg + '\'. Use numbers like 2,2,4,4,9,9');
      }
    }
    return dice;
  }
}

class ProbabilityCalculator {
  static winProbability(die1, die2) {
    let wins = 0;
    let total = die1.numFaces * die2.numFaces;
    for (let i = 0; i < die1.numFaces; i++) {
      for (let j = 0; j < die2.numFaces; j++) {
        if (die1.getFace(i) > die2.getFace(j)) wins++;
      }
    }
    return total > 0 ? wins / total : 0;
  }

  static generateProbabilityTable(dice) {
    let table = new AsciiTable('Win Chances');
    table.setHeading('', ...dice.map((_, i) => 'Die ' + i));
    for (let i = 0; i < dice.length; i++) {
      let row = ['Die ' + i];
      for (let j = 0; j < dice.length; j++) {
        row.push(i === j ? '-' : (this.winProbability(dice[i], dice[j]) * 100).toFixed(2) + '%');
      }
      table.addRow(...row);
    }
    return table.toString();
  }
}

class SecureRandom {
  static generateKey() {
    return crypto.randomBytes(32);
  }

  static generateNumber(max) {
    let bytesNeeded = Math.ceil(Math.log2(max + 1) / 8);
    let maxValid = Math.pow(2, bytesNeeded * 8) - (Math.pow(2, bytesNeeded * 8) % (max + 1));
    let randomValue;
    do {
      let buffer = crypto.randomBytes(bytesNeeded);
      randomValue = buffer.readUIntBE(0, bytesNeeded);
    } while (randomValue >= maxValid);
    return randomValue % (max + 1);
  }

  static computeHMAC(key, number) {
    return crypto.createHmac('sha3-256', key).update(number.toString()).digest('hex').toUpperCase();
  }
}

class FairRandomGenerator {
  constructor(max) {
    this.max = max;
    this.key = SecureRandom.generateKey();
    this.computerNumber = SecureRandom.generateNumber(max);
    this.hmac = SecureRandom.computeHMAC(this.key, this.computerNumber);
  }

  getHMAC() {
    return this.hmac;
  }

  computeResult(userNumber) {
    return (this.computerNumber + userNumber) % (this.max + 1);
  }

  getKey() {
    return this.key.toString('hex').toUpperCase();
  }

  getComputerNumber() {
    return this.computerNumber;
  }
}

class Game {
  constructor(dice) {
    this.dice = dice;
    this.computerDie = null;
    this.userDie = null;
  }

  async run() {
    console.log("Let's decide who picks first.");
    let firstMoveGenerator = new FairRandomGenerator(1);
    console.log("I picked a number between 0 and 1. HMAC: " + firstMoveGenerator.getHMAC());
    console.log("Guess my number:");
    this.showOptions(1);

    let userChoice = await this.getUserInput(1);
    if (userChoice === null) return;

    let firstMoveResult = firstMoveGenerator.computeResult(userChoice);
    console.log("My number was: " + firstMoveGenerator.getComputerNumber() + " (Key: " + firstMoveGenerator.getKey() + ")");
    let computerFirst = firstMoveResult === firstMoveGenerator.getComputerNumber();
    console.log(computerFirst ? "I pick first!" : "You pick first!");

    if (computerFirst) {
      this.computerDie = this.dice[Math.floor(Math.random() * this.dice.length)];
      console.log("I pick die: [" + this.computerDie.faces.join(',') + "]");
      await this.selectUserDie();
    } else {
      await this.selectUserDie();
      this.computerDie = this.dice[Math.floor(Math.random() * this.dice.length)];
      console.log("I pick die: [" + this.computerDie.faces.join(',') + "]");
    }

    if (!this.userDie || !this.computerDie) return;

    let computerRoll = await this.computerRoll();
    if (computerRoll === null) return;

    let userRoll = await this.userRoll();
    if (userRoll === null) return;

    console.log("Your roll: " + userRoll);
    console.log("My roll: " + computerRoll);

    if (userRoll > computerRoll) {
      console.log("You win! (" + userRoll + " > " + computerRoll + ")");
    } else if (computerRoll > userRoll) {
      console.log("I win! (" + computerRoll + " > " + userRoll + ")");
    } else {
      console.log("It's a tie! (" + userRoll + " = " + computerRoll + ")");
    }
  }

  showOptions(max) {
    for (let i = 0; i <= max; i++) {
      console.log(i + " - " + i);
    }
    console.log("X - exit");
    console.log("? - help");
  }

  async getUserInput(max) {
    let rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      let prompt = () => {
        rl.question("Your choice: ", input => {
          input = input.trim().toUpperCase();
          if (input === 'X') {
            console.log("Game cancelled.");
            rl.close();
            resolve(null);
          } else if (input === '?') {
            console.log(ProbabilityCalculator.generateProbabilityTable(this.dice));
            prompt();
          } else {
            let num = parseInt(input);
            if (isNaN(num) || num < 0 || num > max) {
              console.log("Pick a number between 0 and " + max + ", X to exit, or ? for help.");
              prompt();
            } else {
              rl.close();
              resolve(num);
            }
          }
        });
      };
      prompt();
    });
  }

  async selectUserDie() {
    console.log("Pick your die:");
    this.dice.forEach((die, i) => {
      console.log(i + " - [" + die.faces.join(',') + "]");
    });
    console.log("X - exit");
    console.log("? - help");

    let choice = await this.getUserInput(this.dice.length - 1);
    if (choice !== null) {
      this.userDie = this.dice[choice];
      console.log("You picked: [" + this.userDie.faces.join(',') + "]");
    }
  }

  async computerRoll() {
    console.log("My turn to roll.");
    let generator = new FairRandomGenerator(this.computerDie.numFaces - 1);
    console.log("I picked a number between 0 and " + (this.computerDie.numFaces - 1) + ". HMAC: " + generator.getHMAC());
    console.log("Add your number (mod " + this.computerDie.numFaces + "):");
    this.showOptions(this.computerDie.numFaces - 1);

    let userNumber = await this.getUserInput(this.computerDie.numFaces - 1);
    if (userNumber === null) return null;

    let result = generator.computeResult(userNumber);
    console.log("My number: " + generator.getComputerNumber() + " (Key: " + generator.getKey() + ")");
    console.log("Result: " + generator.getComputerNumber() + " + " + userNumber + " = " + result + " (mod " + this.computerDie.numFaces + ")");
    return this.computerDie.getFace(result);
  }

  async userRoll() {
    console.log("Your turn to roll.");
    let generator = new FairRandomGenerator(this.userDie.numFaces - 1);
    console.log("I picked a number between 0 and " + (this.userDie.numFaces - 1) + ". HMAC: " + generator.getHMAC());
    console.log("Add your number (mod " + this.userDie.numFaces + "):");
    this.showOptions(this.userDie.numFaces - 1);

    let userNumber = await this.getUserInput(this.userDie.numFaces - 1);
    if (userNumber === null) return null;

    let result = generator.computeResult(userNumber);
    console.log("My number: " + generator.getComputerNumber() + " (Key: " + generator.getKey() + ")");
    console.log("Result: " + generator.getComputerNumber() + " + " + userNumber + " = " + result + " (mod " + this.userDie.numFaces + ")");
    return this.userDie.getFace(result);
  }
}

async function main() {
  try {
    let dice = DiceParser.parseDice(process.argv.slice(2));
    let game = new Game(dice);
    await game.run();
  } catch (e) {
    console.log("Error: " + e.message);
  }
}

main();
// sudokuJS v0.4.4
// https://github.com/pocketjoso/sudokuJS
// Author: Jonas Ohlsson
// License: MIT

(function (window, $, undefined) {
	'use strict';
	/*TODO:
		--possible additions--
		toggle edit candidates
		undo/redo
	*/

	/**
	* Define a jQuery plugin
	*/
    $.fn.sudokuJS = function(opts) {

		/*
		 * constants
		 *-----------*/

		var DIFFICULTY_EASY = "easy";
		var DIFFICULTY_MEDIUM = "medium";
		var DIFFICULTY_HARD = "hard";
		var DIFFICULTY_VERY_HARD = "very hard";

		var SOLVE_MODE_STEP = "step";
		var SOLVE_MODE_ALL = "all";

		var DIFFICULTIES = [
			DIFFICULTY_EASY,
			DIFFICULTY_MEDIUM,
			DIFFICULTY_HARD,
			DIFFICULTY_VERY_HARD
		];

		/*
		 * variables
		 *-----------*/
		opts = opts || {};
		var solveMode = SOLVE_MODE_STEP,
				difficulty = "unknown",
				candidatesShowing = false,
				editingCandidates = false,
				boardFinished = false,
				boardError = false,
				onlyUpdatedCandidates = false,
				gradingMode = false, //solving without updating UI
				generatingMode = false, //silence board unsolvable errors
				invalidCandidates = [], //used by the generateBoard function


		/*
		the score reflects how much increased difficulty the board gets by having the pattern rather than an already solved cell
		*/
			strategies = [
				{title: "openSingles", fn:	openSingles, score : 0.1	},
				 //harder for human to spot
				{title: "singleCandidate", fn:	singleCandidate, score : 9	},
				{title: "visualElimination", fn:	visualElimination, score : 8	},
				//only eliminates one candidate, should have lower score?
				{title: "nakedPair", fn:	nakedPair, score : 50	},
				{title: "pointingElimination", fn:	pointingElimination, score : 80	},
				//harder for human to spot
				{title: "hiddenPair", fn:	hiddenPair, score :	90	},
				{title: "nakedTriplet", fn:	nakedTriplet, score :	100 },
				//never gets used unless above strats are turned off?
				{title: "hiddenTriplet", fn:	hiddenTriplet, score :	140	},
				//never gets used unless above strats are turned off?
				{title: "nakedQuad", fn:	nakedQuad, score :	150 },
				//never gets used unless above strats are turned off?
				{title: "hiddenQuad", fn:	hiddenQuad, score :	280	}
			],


		//nr of times each strategy has been used for solving this board - used to calculate difficulty score
			usedStrategies = [],

		/*board variable gets enhanced into list of objects on init:
			,{
				val: null
				,candidates: [
					]
			}
		*/
			board = [],
			boardSize,
			boardNumbers = [], //1-9 by default, generated

		//indexes of cells in each house - generated on the fly based on boardSize
			houses = [
				//hor. rows
				[],
				//vert. rows
				[],
				//boxes
				[]
			];




		/*
		 * selectors
		 *-----------*/
		 var $board = $(this),
			$boardInputs, //created
			$boardInputCandidates; //created



		 /*
		 * methods
		 *-----------*/
		 //shortcut for logging..
		function log(msg){
			if(window.console && console.log)
			 console.log(msg);
		}


		//array contains function
		var contains = function(a, obj) {
			for (var i = 0; i < a.length; i++) {
				if (a[i] === obj) {
					return true;
				}
			}
			return false;
		};

		var uniqueArray = function(a) {
			var temp = {};
			for (var i = 0; i < a.length; i++)
				temp[a[i]] = true;
			var r = [];
			for (var k in temp)
				r.push(k);
			return r;
		};



		/* calcBoardDifficulty
		 * --------------
		 *  TYPE: solely based on strategies required to solve board (i.e. single count per strategy)
		 *  SCORE: distinguish between boards of same difficulty.. based on point system. Needs work.
		 * -----------------------------------------------------------------*/
		var calcBoardDifficulty = function(usedStrategies){
			var boardDiff = {};
			if(usedStrategies.length < 3)
				boardDiff.level = DIFFICULTY_EASY;
			else if(usedStrategies.length < 4)
				boardDiff.level = DIFFICULTY_MEDIUM;
			else
				boardDiff.level = DIFFICULTY_HARD;

			var totalScore = 0;
			for(var i=0; i < strategies.length; i++){
				var freq = usedStrategies[i];
				if(!freq)
					continue; //undefined or 0, won't effect score
				var stratObj = strategies[i];
				totalScore += freq * stratObj.score;
			}
			boardDiff.score = totalScore;
			//log("totalScore: "+totalScore);

			if(totalScore > 750)
			// if(totalScore > 2200)
				boardDiff.level = DIFFICULTY_VERY_HARD;

			return boardDiff;
		};


		/* isBoardFinished
		 * -----------------------------------------------------------------*/
		var isBoardFinished = function(){
			for (var i=0; i < boardSize*boardSize; i++){
				if(board[i].val === null)
					return false;
			}
			return true;
		};


		/* generateHouseIndexList
		 * -----------------------------------------------------------------*/
		var generateHouseIndexList = function(){
			var boxSideSize = Math.sqrt(boardSize);

			for(var i=0; i < boardSize; i++){
				var hrow = []; //horisontal row
				var vrow = []; //vertical row
				var box = [];
				for(var j=0; j < boardSize; j++){
					hrow.push(boardSize*i + j);
					vrow.push(boardSize*j + i);

					if(j < boxSideSize){
						for(var k=0; k < boxSideSize; k++){
							//0, 0,0, 27, 27,27, 54, 54, 54 for a standard sudoku
							var a = Math.floor(i/boxSideSize) * boardSize * boxSideSize;
							//[0-2] for a standard sudoku
							var b = (i%boxSideSize) * boxSideSize;
							var boxStartIndex = a +b; //0 3 6 27 30 33 54 57 60

								//every boxSideSize box, skip boardSize num rows to next box (on new horizontal row)
								//Math.floor(i/boxSideSize)*boardSize*2
								//skip across horizontally to next box
								//+ i*boxSideSize;


							box.push(boxStartIndex + boardSize*j + k);
						}
					}
				}
				houses[0].push(hrow);
				houses[1].push(vrow);
				houses[2].push(box);
			}
		};


		/* initBoard
		 * --------------
		 *  inits board, variables.
		 * -----------------------------------------------------------------*/
		var initBoard = function(){
			var alreadyEnhanced = (board[0] !== null && typeof board[0] === "object");
			var nullCandidateList = [];
			boardSize = Math.sqrt(board.length) || 9;
			$board.attr("data-board-size", boardSize);
			if(boardSize % 1 !== 0 || Math.sqrt(boardSize) % 1 !== 0) {
				log("invalid boardSize: "+boardSize);
				if(typeof opts.boardErrorFn === "function")
					opts.boardErrorFn({msg: "invalid board size"});
				return;
			}
			for (var i=0; i < boardSize; i++){
				boardNumbers.push(i+1);
				nullCandidateList.push(null);
			}
			generateHouseIndexList();

			if(!alreadyEnhanced){
				//enhance board to handle candidates, and possibly other params
				for(var j=0; j < boardSize*boardSize ; j++){
					var cellVal = (typeof board[j] === "undefined") ? null : board[j];
					var candidates = cellVal === null ? boardNumbers.slice() : nullCandidateList.slice();
					board[j] = {
						val: cellVal,
						candidates: candidates
						//title: "" possibl add in 'A1. B1...etc
					};
				}
			}
		};


		/* buildBoard
		 * --------------
		 *  dynamically builds board, based on board variable
		 * -----------------------------------------------------------------*/
		var buildBoard = function(){
			//log("buildBoard");
			//log(board);
			var htmlString = "";
			for(var i=0; i < boardSize*boardSize; i++){
				htmlString += buildBoardCell(board[i], i);

				if((i+1) % boardSize === 0) {
					htmlString += "<br>";
				}
			}
			//log(htmlString);
			$board.append(htmlString);

			//save important board elements
			$boardInputs = $board.find("input");
			$boardInputCandidates = $board.find(".candidates");
		};

		/* buildBoardCell
		 * -----------------------------------------------------------------*/
		var buildBoardCell = function(boardCell, id){
			var val = (boardCell.val === null) ? "" : boardCell.val;
			var candidates = boardCell.candidates || [];
			var candidatesString = buildCandidatesString(candidates);
			var maxlength = (boardSize < 10) ? " maxlength='1'" : "";
			return "<div class='sudoku-board-cell'>" +
						//want to use type=number, but then have to prevent chrome scrolling and up down key behaviors..
						"<input type='text' pattern='\\d*' novalidate id='input-"+id+"' value='"+val+"'"+maxlength+">" +
						"<div id='input-"+id+"-candidates' class='candidates'>" + candidatesString + "</div>" +
					"</div>";
		};


		/* buildCandidatesString
		 * -----------------------------------------------------------------*/
		var buildCandidatesString = function(candidatesList){
			var s="";
			for(var i=1; i<boardSize+1; i++){
				if(contains(candidatesList,i))
					s+= "<div>"+i+"</div> ";
				else
					s+= "<div>&nbsp;</div> ";
			}
			return s;
		};


		/* updateUI
		 * --------------
		 *  updates the UI
		 * -----------------------------------------------------------------
		var updateUI = function(opts){
			var opts = opts || {};
			var paintNew = (typeof opts.paintNew !== "undefined") ? opts.paintNew : true;
			updateUIBoard(paintNew);
		}*/

		/* updateUIBoard -
		 * --------------
		 *  updates the board with our latest values
		 * -----------------------------------------------------------------*/
		 var updateUIBoard = function(paintNew){
			//log("re painting every input on board..");
			$boardInputs
				.removeClass("highlight-val")
				.each(function(i,v){
					var $input = $(this);
					var newVal = board[i].val;
					//if(newVal && parseInt($input.val()) !== newVal) {
						$input.val(newVal);
						if(paintNew)
							$input.addClass("highlight-val");
					//}
					var $candidates = $input.siblings(".candidates");
					$candidates.html(buildCandidatesString(board[i].candidates));

				});
		};


		/* updateUIBoardCell -
		 * --------------
		 *  updates ONE cell on the board with our latest values
		 * -----------------------------------------------------------------*/
		 var updateUIBoardCell = function(cellIndex, opts){
			opts = opts || {};
			//log("updateUIBoardCell: "+cellIndex);
			//if(!(opts.mode && opts.mode === "only-candidates")){
				var newVal = board[cellIndex].val;

				//$boardInputs.removeClass("highlight-val");

				//shouldn't always add hightlight-val class
				$("#input-"+cellIndex)
					.val(newVal)
					.addClass("highlight-val");
			//}
			$("#input-"+cellIndex+"-candidates")
				.html(buildCandidatesString(board[cellIndex].candidates));
		};

		/* uIBoardHighlightRemoveCandidate
		 * --------------
		 *  highlight candidate in cell that is about to be removed
		 * -----------------------------------------------------------------*/
		var uIBoardHighlightRemoveCandidate = function(cellIndex, digit){
			$("#input-"+cellIndex+"-candidates div:nth-of-type("+digit+")").addClass("candidate--to-remove");
		};

		/* uIBoardHighlightCandidate -
		 * --------------
		 *  highight candidate in cell that helps eliminate another candidate
		 * -----------------------------------------------------------------*/
		var uIBoardHighlightCandidate = function(cellIndex, digit){
			$("#input-"+cellIndex+"-candidates div:nth-of-type("+digit+")").addClass("candidate--highlight");
		};


		/* removeCandidatesFromCell
		-----------------------------------------------------------------*/
		var removeCandidatesFromCell = function(cell, candidates){
			var boardCell = board[cell];
			var c = boardCell.candidates;
			var cellUpdated = false;
			for(var i=0; i < candidates.length; i++){
				//-1 because candidate '1' is at index 0 etc.
				if(c[candidates[i]-1] !== null) {
					c[candidates[i]-1] = null; //writes to board variable
					cellUpdated = true;
				}
			}
			if(cellUpdated && solveMode === SOLVE_MODE_STEP)
				updateUIBoardCell(cell, {mode: "only-candidates"});
		};


		/* removeCandidatesFromCells
		 * ---returns list of cells where any candidats where removed
		-----------------------------------------------------------------*/
		var removeCandidatesFromCells = function(cells, candidates){
			//log("removeCandidatesFromCells");
			var cellsUpdated = [];
			for (var i=0; i < cells.length; i++){
				var c = board[cells[i]].candidates;

				for(var j=0; j < candidates.length; j++){
					var candidate = candidates[j];
					//-1 because candidate '1' is at index 0 etc.
					if(c[candidate-1] !== null) {
						c[candidate-1] = null; //NOTE: also deletes them from board variable
						cellsUpdated.push(cells[i]); //will push same cell multiple times

						if(solveMode===SOLVE_MODE_STEP){
							//highlight candidate as to be removed on board
							uIBoardHighlightRemoveCandidate(cells[i],candidate);
						}
					}
				}
			}
			return cellsUpdated;
		};

		var highLightCandidatesOnCells = function(candidates, cells){
			for(var i=0; i < cells.length; i++){
				var cellCandidates = board[cells[i]].candidates;

				for(var j=0; j < cellCandidates.length; j++){
					if(contains(candidates, cellCandidates[j]))
						uIBoardHighlightCandidate(cells[i],cellCandidates[j]);
				}

			}
		};


		var resetBoardVariables = function() {
			boardFinished = false;
			boardError = false;
			onlyUpdatedCandidates = false;
			usedStrategies = [];
			gradingMode = false;
		};


		/* clearBoard
		-----------------------------------------------------------------*/
		var clearBoard = function(){
			resetBoardVariables();

			//reset board variable
			var cands = boardNumbers.slice(0);
			for(var i=0; i <boardSize*boardSize;i++){
				board[i] = {
					val: null,
					candidates: cands.slice()
				};
			}

			//reset UI
			$boardInputs
				.removeClass("highlight-val")
				.val("");

			updateUIBoard(false);
		};

		var getNullCandidatesList = function() {
			var l = [];
			for (var i=0; i < boardSize; i++){
				l.push(null);
			}
			return l;
		};


		/* resetCandidates
		-----------------------------------------------------------------*/
		var resetCandidates = function(updateUI){
			var resetCandidatesList = boardNumbers.slice(0);
			for(var i=0; i <boardSize*boardSize;i++){
				if(board[i].val === null){
					board[i].candidates = resetCandidatesList.slice(); //otherwise same list (not reference!) on every cell
					if(updateUI !== false)
						$("#input-"+i+"-candidates").html(buildCandidatesString(resetCandidatesList));
				} else if(updateUI !== false) {
						$("#input-"+i+"-candidates").html("");
				}
			}
		};

		/* setBoardCell - does not update UI
		-----------------------------------------------------------------*/
		var setBoardCell = function(cellIndex, val){
			var boardCell = board[cellIndex];
			//update val
			boardCell.val = val;
			if(val !== null)
				boardCell.candidates = getNullCandidatesList();
		};

		/* indexInHouse
		 * --------------
		 *  returns index (0-9) for digit in house, false if not in house
		 *  NOTE: careful evaluating returned index is IN row, as 0==false.
		 * -----------------------------------------------------------------*/
		 var indexInHouse = function(digit,house){
			for(var i=0; i < boardSize; i++){
				if(board[house[i]].val===digit)
					return i;
			}
			//not in house
			return false;
		};



		 /* housesWithCell
		 * --------------
		 *  returns houses that a cell belongs to
		 * -----------------------------------------------------------------*/
		 var housesWithCell = function(cellIndex){
			var boxSideSize = Math.sqrt(boardSize);
			var houses = [];
			//horisontal row
			var hrow = Math.floor(cellIndex/boardSize);
			houses.push(hrow);
			//vertical row
			var vrow = Math.floor(cellIndex%boardSize);
			houses.push(vrow);
			//box
			var box = (Math.floor(hrow/boxSideSize)*boxSideSize) + Math.floor(vrow/boxSideSize);
			houses.push(box);

			return houses;
		};


		/* numbersLeft
		 * --------------
		 *  returns unused numbers in a house
		 * -----------------------------------------------------------------*/
		 var numbersLeft = function(house){
			var numbers = boardNumbers.slice();
			for(var i=0; i < house.length; i++){
				for(var j=0; j < numbers.length; j++){
					//remove all numbers that are already being used
					if(numbers[j] === board[house[i]].val)
						numbers.splice(j,1);
				}
			}
			//return remaining numbers
			return numbers;
		};


		 /* numbersTaken
		 * --------------
		 *  returns used numbers in a house
		 * -----------------------------------------------------------------*/
		 var numbersTaken = function(house){
			var numbers = [];
			for(var i=0; i < house.length; i++){
				var n = board[house[i]].val;
				if(n !== null)
					numbers.push(n);
			}
			//return remaining numbers
			return numbers;
		};


		 /* candidatesLeft
		 * --------------
		 *  returns list of candidates for cell (with null's removed)
		 * -----------------------------------------------------------------*/
		 var candidatesLeft = function(cellIndex){
			var t = [];
			var candidates = board[cellIndex].candidates;
			for (var i=0; i < candidates.length; i++){
				if (candidates[i] !== null)
					t.push(candidates[i]);
			}
			return t;
		};


		 /* cellsForCandidate
		 * --------------
		 *  returns list of possible cells (cellIndex) for candidate (in a house)
		 * -----------------------------------------------------------------*/
		 var cellsForCandidate = function(candidate,house){
			var t = [];
			for(var i=0; i < house.length; i++){
				var cell = board[house[i]];
				var candidates = cell.candidates;
				if(contains(candidates, candidate))
					t.push(house[i]);
			}
			return t;
		};



		/* openSingles
		 * --------------
		 *  checks for houses with just one empty cell - fills it in board variable if so
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function openSingles(){
			//log("looking for openSingles");

			//for each type of house..(hor row / vert row / box)
			var hlength = houses.length;
			for(var i=0; i < hlength; i++){

				//for each such house
				var housesCompleted = 0; //if goes up to 9, sudoku is finished

				for(var j=0; j < boardSize; j++){
					var emptyCells = [];

					// for each cell..
					for (var k=0; k < boardSize; k++){

						var boardIndex = houses[i][j][k];
						if(board[boardIndex].val === null) {
							emptyCells.push({house: houses[i][j], cell: boardIndex});
							if(emptyCells.length > 1) {
								//log("more than one empty cell, house area :["+i+"]["+j+"]");
								break;
							}
						}
					}
					//one empty cell found
					if(emptyCells.length === 1){
						var emptyCell = emptyCells[0];
						//grab number to fill in in cell
						var val = numbersLeft(emptyCell.house);
						if(val.length > 1) {
							//log("openSingles found more than one answer for: "+emptyCell.cell+" .. board incorrect!");
							boardError = true; //to force solve all loop to stop
							return -1; //error
						}

						//log("fill in single empty cell " + emptyCell.cell+", val: "+val);

						setBoardCell(emptyCell.cell, val[0]); //does not update UI
						if(solveMode===SOLVE_MODE_STEP)
							uIBoardHighlightCandidate(emptyCell.cell, val[0]);

						return [emptyCell.cell];
					}
					//no empty ells..
					if(emptyCells.length === 0) {
						housesCompleted++;
						//log(i+" "+j+": "+housesCompleted);
						if(housesCompleted === boardSize){
							boardFinished = true;
							return -1; //special case, done
						}
					}
				}
			}
			return false;
		}


		/* visualEliminationOfCandidates
		 * --------------
		 * ALWAYS returns false
		 * -- special compared to other strats: doesn't step - updates whole board,
		 in one go. Since it also only updates candidates, we can skip straight to next strat, since we know that neither this one nor the one(s) before (that only look at actual numbers on board), will find anything new.
		 * -----------------------------------------------------------------*/
		function visualEliminationOfCandidates(){
			//for each type of house..(hor row / vert row / box)
			var hlength = houses.length;
			for(var i=0; i < hlength; i++){

				//for each such house
				for(var j=0; j < boardSize; j++){
					var house = houses[i][j];
					var candidatesToRemove = numbersTaken(house);
					//log(candidatesToRemove);

					// for each cell..
					for (var k=0; k < boardSize; k++){
						var cell = house[k];
						var candidates = board[cell].candidates;
						removeCandidatesFromCell(cell, candidatesToRemove);
					}
				}
			}
			return false;
		}


		/* visualElimination
		 * --------------
		 * Looks for houses where a digit only appears in one slot
		 * -meaning we know the digit goes in that slot.
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function visualElimination(){
			//log("visualElimination");
			//for each type of house..(hor row / vert row / box)
			var hlength = houses.length;
			for(var i=0; i < hlength; i++){

				//for each such house
				for(var j=0; j < boardSize; j++){
					var house = houses[i][j];
					var digits = numbersLeft(house);

					//for each digit left for that house
					for (var k=0; k < digits.length; k++){
						var digit = digits[k];
						var possibleCells = [];

						//for each cell in house
						for(var l=0; l < boardSize; l++){
							var cell = house[l];
							var boardCell = board[cell];
							//if the digit only appears as a candidate in one slot, that's where it has to go
							if (contains(boardCell.candidates, digit)){
								possibleCells.push(cell);
								if(possibleCells.length > 1)
									break; //no we can't tell anything in this case
							}
						}

						if(possibleCells.length === 1){
							var cellIndex = possibleCells[0];

							//log("only slot where "+digit+" appears in house. ");


							setBoardCell(cellIndex, digit); //does not update UI

							if(solveMode===SOLVE_MODE_STEP)
								uIBoardHighlightCandidate(cellIndex, digit);

							onlyUpdatedCandidates = false;
							return [cellIndex]; //one step at the time
						}
					}

				}
			}
			return false;
		}


		/* singleCandidate
		 * --------------
		 * Looks for cells with only one candidate
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function singleCandidate(){
			//before we start with candidate strategies, we need to update candidates from last round:
			visualEliminationOfCandidates(); //TODO: a bit hackyy, should probably not be here

			//for each cell

			for(var i=0; i < board.length; i++){
				var cell = board[i];
				var candidates = cell.candidates;

				//for each candidate for that cell
				var possibleCandidates = [];
				for (var j=0; j < candidates.length; j++){
					if (candidates[j] !== null)
						possibleCandidates.push(candidates[j]);
					if(possibleCandidates.length >1)
						break; //can't find answer here
				}
				if(possibleCandidates.length === 1){
					var digit = possibleCandidates[0];

					//log("only one candidate in cell: "+digit+" in house. ");


					setBoardCell(i, digit); //does not update UI
					if(solveMode===SOLVE_MODE_STEP)
						uIBoardHighlightCandidate(i, digit);

					onlyUpdatedCandidates = false;
					return [i]; //one step at the time
				}
			}
			return false;
		}


		/* pointingElimination
		 * --------------
		 * if candidates of a type (digit) in a box only appar on one row, all other
		 * same type candidates can be removed from that row
		 ------------OR--------------
		 * same as above, but row instead of box, and vice versa.
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function pointingElimination(){
			var effectedCells = false;

			//for each type of house..(hor row / vert row / box)
			var hlength = houses.length;
			for(var a=0; a < hlength; a++){
				var houseType = a;

				for(var i=0; i < boardSize; i++){
					var house = houses[houseType][i];

					//for each digit left for this house
					var digits = numbersLeft(house);
					for(var j=0; j< digits.length; j++){
						var digit = digits[j];
						//check if digit (candidate) only appears in one row (if checking boxes),
						//, or only in one box (if checking rows)

						var sameAltHouse = true; //row if checking box, and vice versa
						var houseId = -1;
						//when point checking from box, need to compare both kind of rows
						//that box cells are also part of, so use houseTwoId as well
						var houseTwoId = -1;
						var sameAltTwoHouse = true;
						var cellsWithCandidate = [];
						//var cellDistance = null;

						//for each cell
						for(var k=0; k < house.length; k++){
							var cell = house[k];

							if (contains(board[cell].candidates,digit)) {
								var cellHouses = housesWithCell(cell);
								var newHouseId = (houseType ===2) ? cellHouses[0] : cellHouses[2];
								var newHouseTwoId = (houseType ===2) ? cellHouses[1] : cellHouses[2];

								//if(cellsWithCandidate.length > 0){ //why thice the same?


									if(cellsWithCandidate.length > 0){
										if(newHouseId !== houseId){
											sameAltHouse = false;
										}
										if(houseTwoId !== newHouseTwoId){
											sameAltTwoHouse = false;
										}
										if(sameAltHouse === false && sameAltTwoHouse === false){
											break; //not in same altHouse (box/row)
										}

									}
								//}
								houseId = newHouseId;
								houseTwoId = newHouseTwoId;
								cellsWithCandidate.push(cell);
							}
						}
						if((sameAltHouse === true || sameAltTwoHouse === true ) && cellsWithCandidate.length > 0){
							//log("sameAltHouse..");
							//we still need to check that this actually eliminates something, i.e. these possible cells can't be only in house

							//first figure out what kind of house we are talking about..
							var h = housesWithCell(cellsWithCandidate[0]);
							var altHouseType = 2;
							if(houseType ===2){
								if(sameAltHouse)
									altHouseType = 0;
								else
									altHouseType = 1;
							}


							var altHouse = houses[altHouseType][h[altHouseType]];
							var cellsEffected = [];

							//log("houses["+houseType+"]["+h[houseType]+"].length: "+houses[houseType][h[houseType]].length);

							//need to remove cellsWithCandidate - from cells to remove from
							for (var x=0; x< altHouse.length; x++){
								if(!contains(cellsWithCandidate, altHouse[x])) {
									cellsEffected.push(altHouse[x]);
								}
							}
							//log("houses["+houseType+"]["+h[houseType]+"].length: "+houses[houseType][h[houseType]].length);

							//remove all candidates on altHouse, outside of house
							var cellsUpdated = removeCandidatesFromCells(cellsEffected, [digit]);

							if(cellsUpdated.length > 0){
								// log("pointing: digit "+digit+", from houseType: "+houseType);

								if(solveMode === SOLVE_MODE_STEP)
									highLightCandidatesOnCells([digit], cellsWithCandidate);


								onlyUpdatedCandidates = true;

								//return cellsUpdated.concat(cellsWithCandidate);
								//only return cells where we actually update candidates
								return cellsUpdated;
							}
						}
					}
				}
			}
			return false;
		}



		/* nakedCandidates
		 * --------------
		 * looks for n nr of cells in house, which together has exactly n unique candidates.
			this means these candidates will go into these cells, and can be removed elsewhere in house.
		 *
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function nakedCandidates(n){

			//for each type of house..(hor row / vert row / box)
			var hlength = houses.length;
			for(var i=0; i < hlength; i++){

				//for each such house
				for(var j=0; j < boardSize; j++){
					//log("["+i+"]"+"["+j+"]");
					var house = houses[i][j];
					if(numbersLeft(house).length <= n) //can't eliminate any candidates
						continue;
					var combineInfo = []; //{cell: x, candidates: []}, {} ..
					//combinedCandidates,cellsWithCandidate;
					var minIndexes = [-1];
					//log("--------------");
					//log("house: ["+i+"]["+j+"]");


					//checks every combo of n candidates in house, returns pattern, or false
					var result = checkCombinedCandidates(house, 0);
					if(result !== false)
						return result;
				}
			}
			return false; //pattern not found

			function checkCombinedCandidates(house, startIndex){
				//log("startIndex: "+startIndex);
				for(var i=Math.max(startIndex, minIndexes[startIndex]); i < boardSize-n+startIndex; i++){
					//log(i);

					//never check this cell again, in this loop
					minIndexes[startIndex] = i+1;
					//or in a this loop deeper down in recursions
					minIndexes[startIndex+1] = i+1;

					//if(startIndex === 0){
					//	combinedCandidates = [];
					//	cellsWithCandidate = []; //reset
					//}
					var cell = house[i];
					var cellCandidates = candidatesLeft(cell);

					if(cellCandidates.length === 0 || cellCandidates.length > n)
						continue;


					//try adding this cell and it's cellCandidates,
					//but first need to check that that doesn't make (unique) amount of
					//candidates in combineInfo > n

					//if this is the first item we add, we don't need this check (above one is enough)
					if(combineInfo.length > 0){
						var temp = cellCandidates.slice();
						for(var a =0; a < combineInfo.length; a++){
							var candidates = combineInfo[a].candidates;
							for(var b=0; b < candidates.length; b++){
								if(!contains(temp,candidates[b]))
									temp.push(candidates[b]);
							}
						}
						if(temp.length > n){
							continue; //combined candidates spread over > n cells, won't work
						}

					}

					combineInfo.push({cell: cell, candidates: cellCandidates});


					if(startIndex < n-1) {
						//still need to go deeper into combo
						var r = checkCombinedCandidates(house, startIndex+1);
						//when we come back, check if that's because we found answer.
						//if so, return with it, otherwise, keep looking
						if (r !== false)
							return r;
					}

					//check if we match our pattern
					//if we have managed to combine n-1 cells,
					//(we already know that combinedCandidates is > n)
					//then we found a match!
					if(combineInfo.length === n){
						//now we need to check whether this eliminates any candidates


						//now we need to check whether this eliminates any candidates

						var cellsWithCandidates = [];
						var combinedCandidates = []; //not unique either..
						for(var x=0; x< combineInfo.length;x++){
							cellsWithCandidates.push(combineInfo[x].cell);
							combinedCandidates = combinedCandidates.concat(combineInfo[x].candidates);
						}



						//get all cells in house EXCEPT cellsWithCandidates
						var cellsEffected = [];
						for (var y=0; y< boardSize; y++){
							if(!contains(cellsWithCandidates, house[y])) {
								cellsEffected.push(house[y]);
							}
						}

						//remove all candidates on house, except the on cells matched in pattern
						var cellsUpdated = removeCandidatesFromCells(cellsEffected, combinedCandidates);

						//if it does remove candidates, we're succeded!
						if(cellsUpdated.length > 0){
							//log("nakedCandidates: ");
							//log(combinedCandidates);

							if(solveMode === SOLVE_MODE_STEP)
								highLightCandidatesOnCells(combinedCandidates, cellsWithCandidates);

							onlyUpdatedCandidates = true;
							//return cellsWithCandidates.concat(cellsUpdated);

							//return cells we actually update, duplicates removed
							return uniqueArray(cellsUpdated);
						}
					}
				}
				if(startIndex > 0) {
					//if we added a value to our combo check, but failed to find pattern, we now need drop that value and go back up in chain and continue to check..
					if(combineInfo.length > startIndex-1){
						//log("nakedCans: need to pop last added values..");
						combineInfo.pop();
					}
				}
				return false;
			}
		}


		/* nakedPair
		 * --------------
		 * see nakedCandidateElimination for explanation
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function nakedPair(){
			return nakedCandidates(2);
		}

		/* nakedTriplet
		 * --------------
		 * see nakedCandidateElimination for explanation
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function nakedTriplet(){
			return nakedCandidates(3);
		}

		/* nakedQuad
		 * --------------
		 * see nakedCandidateElimination for explanation
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function nakedQuad(){
			return nakedCandidates(4);
		}




		/* hiddenLockedCandidates
		 * --------------
		 * looks for n nr of cells in house, which together has exactly n unique candidates.
			this means these candidates will go into these cells, and can be removed elsewhere in house.
		 *
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function hiddenLockedCandidates(n){

			//for each type of house..(hor row / vert row / box)
			var hlength = houses.length;
			for(var i=0; i < hlength; i++){

				//for each such house
				for(var j=0; j < boardSize; j++){
					var house = houses[i][j];
					if(numbersLeft(house).length <= n) //can't eliminate any candidates
						continue;
					var combineInfo = []; //{candate: x, cellsWithCandidate: []}, {} ..
					//combinedCandidates,cellsWithCandidate;
					var minIndexes = [-1];
					//log("--------------");
					//log("house: ["+i+"]["+j+"]");

					//checks every combo of n candidates in house, returns pattern, or false
					var result = checkLockedCandidates(house, 0);
					if(result !== false)
						return result;
				}
			}
			return false; //pattern not found

			function checkLockedCandidates(house, startIndex){
				//log("startIndex: "+startIndex);
				for(var i=Math.max(startIndex, minIndexes[startIndex]); i <= boardSize-n+startIndex; i++){

					//log(i);
					//never check this cell again, in this loop
					minIndexes[startIndex] = i+1;
					//or in a this loop deeper down in recursions
					minIndexes[startIndex+1] = i+1;

					var candidate = i+1;
					//log(candidate);


					var possibleCells = cellsForCandidate(candidate,house);

					if(possibleCells.length === 0 || possibleCells.length > n)
						continue;

					//try adding this candidate and it's possible cells,
					//but first need to check that that doesn't make (unique) amount of
					//possible cells in combineInfo > n
					if(combineInfo.length > 0){
						var temp = possibleCells.slice();
						for(var a =0; a < combineInfo.length; a++){
							var cells = combineInfo[a].cells;
							for(var b=0; b < cells.length; b++){
								if(!contains(temp,cells[b]))
									temp.push(cells[b]);
							}
						}
						if(temp.length > n){
							//log("combined candidates spread over > n cells");
							continue; //combined candidates spread over > n cells, won't work
						}

					}

					combineInfo.push({candidate: candidate, cells: possibleCells});

					if(startIndex < n-1) {
						//still need to go deeper into combo
						var r = checkLockedCandidates(house, startIndex+1);
						//when we come back, check if that's because we found answer.
						//if so, return with it, otherwise, keep looking
						if (r !== false)
							return r;
					}
					//check if we match our pattern
					//if we have managed to combine n-1 candidates,
					//(we already know that cellsWithCandidates is <= n)
					//then we found a match!
					if(combineInfo.length === n){

						//now we need to check whether this eliminates any candidates

						var combinedCandidates = []; //not unique now...
						var cellsWithCandidates = []; //not unique either..
						for(var x=0; x< combineInfo.length;x++){
							combinedCandidates.push(combineInfo[x].candidate);
							cellsWithCandidates = cellsWithCandidates.concat(combineInfo[x].cells);
						}


						var candidatesToRemove = [];
						for(var c=0; c<boardSize; c++){
							if(!contains(combinedCandidates, c+1))
								candidatesToRemove.push(c+1);
						}
						//log("candidates to remove:")
						//log(candidatesToRemove);

						//remove all other candidates from cellsWithCandidates
						var cellsUpdated = removeCandidatesFromCells(cellsWithCandidates, candidatesToRemove);

						//if it does remove candidates, we're succeded!
						if(cellsUpdated.length > 0){
							//log("hiddenLockedCandidates: ");
							//log(combinedCandidates);

							if(solveMode === SOLVE_MODE_STEP)
								highLightCandidatesOnCells(combinedCandidates, cellsWithCandidates);

							onlyUpdatedCandidates = true;

							//filter out duplicates
							return uniqueArray(cellsWithCandidates);
						}
					}
				}
				if(startIndex > 0) {
					//if we added a value to our combo check, but failed to find pattern, we now need drop that value and go back up in chain and continu to check..
					if(combineInfo.length > startIndex-1){
						combineInfo.pop();
					}
				}
				return false;
			}
		}



		/* hiddenPair
		 * --------------
		 * see hiddenLockedCandidates for explanation
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function hiddenPair(){
			return hiddenLockedCandidates(2);
		}


		/* hiddenTriplet
		 * --------------
		 * see hiddenLockedCandidates for explanation
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function hiddenTriplet(){
			return hiddenLockedCandidates(3);
		}

		/* hiddenQuad
		 * --------------
		 * see hiddenLockedCandidates for explanation
		 * -- returns effectedCells - the updated cell(s), or false
		 * -----------------------------------------------------------------*/
		function hiddenQuad(){
			return hiddenLockedCandidates(4);
		}




		/* solveFn
		 * --------------
		 *  applies strategy i (where i represents strategy, ordered by simplicity
		 *  -if strategy fails (too advanced a sudoku) AND an more advanced strategy exists:
		 *		calls itself with i++
		 *  returns canContinue true|false - only relevant for solveMode "all"
		 * -----------------------------------------------------------------*/
		var nrSolveLoops = 0;
		var effectedCells = false;

		var solveFn = function(i){
			//log(i);
			if(boardFinished) {
				if(!gradingMode) {
					updateUIBoard(false);
					//log("finished!");
					//log("usedStrats:")
					//log(usedStrategies);

					//callback
					if(typeof opts.boardFinishedFn === "function"){
						opts.boardFinishedFn({
							difficultyInfo: calcBoardDifficulty(usedStrategies)
						});
					}
				}

				return false; //we're done!

			} else if (solveMode === SOLVE_MODE_STEP){
				//likely that we're updating twice if !candidatesShowing && !onlyUpdatedCandidates,
				//but we can't tell if user just toggled candidatesShowing.. so have to do it here (again).
				if(effectedCells && effectedCells !== -1){
					//update candidates and/or new numbers
					//remove highlights from last step
					$boardInputs.removeClass("highlight-val");
					$(".candidate--highlight").removeClass("candidate--highlight");
					//update board with new effected cell(s) info
					for(var j=0; j < effectedCells.length; j++){
						updateUIBoardCell(effectedCells[j]);
					}
				}
			}

			nrSolveLoops++;
			var strat = strategies[i].fn;
			//log("use strat nr:" +i);
			effectedCells = strat();

			if(effectedCells === false){
				if(strategies.length > i+1) {
					return solveFn(i+1);
				} else {
					if(typeof opts.boardErrorFn === "function" && !generatingMode)
						opts.boardErrorFn({msg: "no more strategies"});

					if(!gradingMode && !generatingMode && solveMode===SOLVE_MODE_ALL)
						updateUIBoard(false);
					return false;
				}

			} else if (boardError){
				if(typeof opts.boardErrorFn === "function")
					opts.boardErrorFn({msg: "Board incorrect"});

				if(solveMode === SOLVE_MODE_ALL) {
					updateUIBoard(false); //show user current state of board... how much they need to reset for it to work again.
				}

				return false; //we can't do no more solving

			} else if(solveMode===SOLVE_MODE_STEP){
				// if user clicked solve step, and we're only going to fill in a new value (not messing with candidates) - then show user straight away
				//callback
				if(typeof opts.boardUpdatedFn === "function") {
					opts.boardUpdatedFn({cause: strategies[i].title, cellsUpdated: effectedCells});
				}

				//check if this finished the board
				if(isBoardFinished()){
					boardFinished = true;
					//callback
					if(typeof opts.boardFinishedFn === "function"){
						opts.boardFinishedFn({
							difficultyInfo: calcBoardDifficulty(usedStrategies)
						});
					}
					//paint the last cell straight away
					if(candidatesShowing)
						updateUIBoard(false);
				}



				//if a new number was filled in, show this on board
				if(!candidatesShowing && !onlyUpdatedCandidates &&
					effectedCells && effectedCells !== -1){
					//remove highlights from last step
					$boardInputs.removeClass("highlight-val");
					$(".candidate--highlight").removeClass("candidate--highlight");
					//update board with new effected cell(s) info
					for(var k=0; k < effectedCells.length; k++){
						updateUIBoardCell(effectedCells[k]);
					}
				}
			}

			//we got an answer, using strategy i
			if(typeof usedStrategies[i] === "undefined")
				usedStrategies[i] = 0;
			usedStrategies[i] = usedStrategies[i] + 1;
			//if we only updated candidates, make sure they're showing
			if(!gradingMode && !candidatesShowing && onlyUpdatedCandidates){// && i > 3){
				showCandidates();

				//callback in case UI has toggle btn, so it can be updated
				if(typeof opts.candidateShowToggleFn === "function")
					opts.candidateShowToggleFn(true);
			}

			return true; // can continue
		};


		/* keyboardMoveBoardFocus - puts focus on adjacent board cell
		 * -----------------------------------------------------------------*/
		var keyboardMoveBoardFocus = function(currentId, keyCode){
			var newId = currentId;
			//right
			if(keyCode ===39)
				newId++;
			//left
			else if(keyCode === 37)
				newId--;
			//down
			else if(keyCode ===40)
				newId = newId + boardSize;
			//up
			else if(keyCode ===38)
				newId = newId - boardSize;

			//out of bounds
			if(newId < 0 || newId > (boardSize*boardSize))
				return;

			//focus input
			$("#input-"+newId).focus();
		};


		/* toggleCandidateOnCell - used for editingCandidates mode
		 * -----------------------------------------------------------------*/
		var toggleCandidateOnCell = function(candidate, cell){
			var boardCell = board[cell];
			if(boardCell.val){
				return;  // don't modify candidates when a cell already has a number
			}
			var c = boardCell.candidates;
			c[candidate-1] = c[candidate-1] === null ? candidate : null;
			if(solveMode === SOLVE_MODE_STEP)
				updateUIBoardCell(cell, {mode: "only-candidates"});
		};

		/* keyboardNumberInput - update our board model
		 * -----------------------------------------------------------------*/
		var keyboardNumberInput = function(input, id){
			var val = parseInt(input.val());
			if(editingCandidates){
				toggleCandidateOnCell(val, id);
				// reset value on board
				input.val(board[id].val);
				return;
			}

			//log(id+": "+val +" entered.");

			var candidates = getNullCandidatesList(); //[null,null....null];


			if (val > 0) { //invalidates Nan
				//check that this doesn't make board incorrect
				var temp = housesWithCell(id);
				//for each type of house
				for(var i=0; i < houses.length; i++){

					if(indexInHouse(val, houses[i][temp[i]])){
						//digit already in house - board incorrect with user input
						// log("board incorrect!");
						var alreadyExistingCellInHouseWithDigit = houses[i][temp[i]][indexInHouse(val, houses[i][temp[i]])];

						//this happens in candidate mode, if we highlight on ui board before entering value, and user then enters before us.
						if(alreadyExistingCellInHouseWithDigit === id)
							continue;

						$("#input-" + alreadyExistingCellInHouseWithDigit + ", #input-"+id)
							.addClass("board-cell--error");
						//make as incorrect in UI

						//input was incorrect, so don't update our board model
						return;
					}
				}

				//remove candidates..
				input.siblings(".candidates").html(buildCandidatesString(candidates));
				//update board
				board[id].candidates = candidates;
				board[id].val = val;

				//check if that finished board
				if(isBoardFinished()){
					boardFinished = true;
					log("user finished board!");
					if(typeof opts.boardFinishedFn === "function"){
						opts.boardFinishedFn({
							//we rate the board via what strategies was used to solve it
							//we don't have this info if user solved it, unless we
							//always analyze board on init.. but that could be slow.

							//difficultyInfo: null
						});
					}
				}
			} else {
				boardError = false; //reset, in case they fixed board - otherwise, we'll find the error again
				val = null;
				//add back candidates to UI cell
				candidates = boardNumbers.slice();
				input.siblings(".candidates").html(buildCandidatesString(candidates));

				//needs to happen before we resetCandidates below
				board[id].val = val;

				//update candidates (if we could reverse remove candidates from this cell and outwards, we wouldn't have to redo all board)
				resetCandidates();
				visualEliminationOfCandidates();
			}
			//log(board[1].candidates);

			//HACK: remove all errors as soon as they fix one - the other cells just get emptied on board (in UI; already were null in model)
			if($("#input-"+id).hasClass("board-cell--error"))
				$boardInputs.removeClass("board-cell--error");

			if(typeof opts.boardUpdatedFn === "function")
				opts.boardUpdatedFn({cause: "user input", cellsUpdated: [id]});

			onlyUpdatedCandidates = false;
		};

		/* toggleShowCandidates
		 * -----------------------------------------------------------------*/
		var toggleShowCandidates = function(){
			$board.toggleClass("showCandidates");
			candidatesShowing = !candidatesShowing;
		};

		 /* analyzeBoard
		  * solves a copy of the current board(without updating the UI),
		  * reports back: error|finished, usedStrategies and difficulty level and score
		  * -----------------------------------------------------------------*/
		 var analyzeBoard = function(){
			gradingMode = true;
			solveMode = SOLVE_MODE_ALL;
			var usedStrategiesClone = JSON.parse(JSON.stringify(usedStrategies));
			var boardClone = JSON.parse(JSON.stringify(board));
			var canContinue = true;
			while(canContinue) {
				var startStrat = onlyUpdatedCandidates ? 2 : 0;
				canContinue = solveFn(startStrat);
			}

			var data = {};
			if(boardError){
				data.error = "Board incorrect";
			}
			else {
				data.finished = boardFinished;
				data.usedStrategies = [];
				for (var i=0; i<usedStrategies.length; i++){
					var strat = strategies[i];
					//only return strategies that were actually used
					if (typeof usedStrategies[i] !=="undefined"){
						data.usedStrategies[i] = {
							title: strat.title,
							freq: usedStrategies[i]
						};
					}
				}

				if (boardFinished) {
					var boardDiff = calcBoardDifficulty(usedStrategies);
					data.level = boardDiff.level;
					data.score = boardDiff.score;
				}
			}

			//restore everything to state (before solving)
			resetBoardVariables();
			usedStrategies  = usedStrategiesClone;
			board = boardClone;

			return data;
		};


		 var setBoardCellWithRandomCandidate = function(cellIndex, forceUIUpdate){
			// CHECK still valid
			visualEliminationOfCandidates();
			// DRAW RANDOM CANDIDATE
			// don't draw already invalidated candidates for cell
			var invalids = invalidCandidates && invalidCandidates[cellIndex];
			// TODO: don't use JS filter - not supported enough(?)
			var candidates = board[cellIndex].candidates.filter(function(candidate){
				if(!candidate || (invalids && contains(invalids, candidate)))
					return false;
				return candidate;
			});
			// if cell has 0 candidates - fail to set cell.
			if(candidates.length === 0) {
				return false;
			}
			var randIndex = Math.round ( Math.random() * (candidates.length - 1));
			var randomCandidate = candidates[randIndex];
			// UPDATE BOARD
			setBoardCell(cellIndex, randomCandidate);
			return true;
		};

		var generateBoardAnswerRecursively = function(cellIndex){
			if((cellIndex+1) > (boardSize*boardSize)){
				//done
				invalidCandidates = [];
				return true;
			}
			if(setBoardCellWithRandomCandidate(cellIndex)){
				generateBoardAnswerRecursively(cellIndex + 1);
			} else {
				if(cellIndex <= 0)
					return false;
				var lastIndex = cellIndex - 1;
				invalidCandidates[lastIndex] = invalidCandidates[lastIndex] || [];
				invalidCandidates[lastIndex].push(board[lastIndex].val);
				// set val back to null
				setBoardCell(lastIndex, null);
				// reset candidates, only in model.
				resetCandidates(false);
				// reset invalid candidates for cellIndex
				invalidCandidates[cellIndex] = [];
				// then try again
				generateBoardAnswerRecursively(lastIndex);
				return false;
			}
		};

		var easyEnough = function(data){
			// console.log(data.level);
			if(data.level === DIFFICULTY_EASY)
				return true;
			if(data.level === DIFFICULTY_MEDIUM)
				return difficulty !== DIFFICULTY_EASY;
			if(data.level === DIFFICULTY_HARD)
				return difficulty !== DIFFICULTY_EASY && difficulty !== DIFFICULTY_MEDIUM;
			if(data.level === DIFFICULTY_VERY_HARD)
				return difficulty !== DIFFICULTY_EASY && difficulty !== DIFFICULTY_MEDIUM && difficulty !== DIFFICULTY_HARD;
		};
		var hardEnough = function(data) {
			if(difficulty === DIFFICULTY_EASY)
				return true;
			if(difficulty === DIFFICULTY_MEDIUM)
				return data.level !== DIFFICULTY_EASY;
			if(difficulty === DIFFICULTY_HARD)
				return data.level !== DIFFICULTY_EASY && data.level !== DIFFICULTY_MEDIUM;
			if(difficulty === DIFFICULTY_VERY_HARD)
				return data.level !== DIFFICULTY_EASY && data.level !== DIFFICULTY_MEDIUM && data.level !== DIFFICULTY_HARD;
		};

		var digCells = function(){
			var cells = [];
			var given = boardSize*boardSize;
			var minGiven = 17;
			if(difficulty === DIFFICULTY_EASY){
				minGiven = 40;
			} else if(difficulty === DIFFICULTY_MEDIUM){
				minGiven = 30;
			}
			for (var i=0; i < boardSize*boardSize; i++){
				cells.push(i);
			}

			while(cells.length > 0 && given > minGiven){
				var randIndex = Math.round ( Math.random() * (cells.length - 1));
				var cellIndex = cells.splice(randIndex,1);
				var val = board[cellIndex].val;

				// remove value from this cell
				setBoardCell(cellIndex, null);
				// reset candidates, only in model.
				resetCandidates(false);

				var data = analyzeBoard();
				if (data.finished !== false && easyEnough(data)) {
					given--;
				} else {
					// reset - don't dig this cell
					setBoardCell(cellIndex, val);
				}

			}
		};

		var generateBoard = function(diff, callback){
			if($boardInputs)
				clearBoard();
			difficulty = contains(DIFFICULTIES, diff) ? diff : DIFFICULTY_MEDIUM;
			generatingMode = true;
			solveMode = SOLVE_MODE_ALL;

			// the board generated will possibly not be hard enough
			// (if you asked for "hard", you most likely get "medium")
			generateBoardAnswerRecursively(0);

			// attempt one - save the answer, and try digging multiple times.
			var boardAnswer = board.slice();

			var boardTooEasy = true;

			while(boardTooEasy){
				digCells();
				var data = analyzeBoard();
				if(hardEnough(data))
					boardTooEasy = false;
				else
					board = boardAnswer;
			}
			solveMode = SOLVE_MODE_STEP;
			if($boardInputs)
				updateUIBoard();

			visualEliminationOfCandidates();

			if(typeof callback === 'function'){
				callback();
			}
		};


		/*
		 * init/API/events
		 *-----------*/
		if(!opts.board) {
			initBoard();
			generateBoard(opts.difficulty);
			buildBoard();
		} else {
			board = opts.board;
			initBoard();
			buildBoard();
			visualEliminationOfCandidates();
		}


		$boardInputs.on("keyup", function(e){
			var $this = $(this);
			var id = parseInt($this.attr("id").replace("input-",""));
			//allow keyboard movements
			if(e.keyCode >=37 && e.keyCode <= 40){// || e.keyCode ===48){
				keyboardMoveBoardFocus(id, e.keyCode);
			}
		});
		//listen on change because val is incorrect all the time on keyup, because have to filter out all other keys.
		$boardInputs.on("change", function(){
			var $this = $(this);
			var id = parseInt($this.attr("id").replace("input-",""));
			keyboardNumberInput($this, id);
		});



		/**
		* PUBLIC methods
		* ----------------- */
		var solveAll = function(){
			solveMode = SOLVE_MODE_ALL;
			var canContinue = true;
			while(canContinue) {
				var startStrat = onlyUpdatedCandidates ? 2 : 0;
				canContinue = solveFn(startStrat);
			}
		};

		var solveStep = function(){
			solveMode = SOLVE_MODE_STEP;
			var startStrat = onlyUpdatedCandidates ? 2 : 0;
			solveFn(startStrat);
		};

		var getBoard = function(){
			return board;
		};

		var setBoard = function(newBoard){
			board = newBoard;
			initBoard();
			visualEliminationOfCandidates();
			updateUIBoard(false);
		};

		var hideCandidates = function(){
			$board.removeClass("showCandidates");
			candidatesShowing = false;
		};
		var showCandidates = function(){
			$board.addClass("showCandidates");
			candidatesShowing = true;
		};

		var setEditingCandidates = function(newVal){
			editingCandidates = newVal;
		};

		return {
			solveAll : solveAll,
			solveStep : solveStep,
			analyzeBoard : analyzeBoard,
			clearBoard : clearBoard,
			getBoard : getBoard,
			setBoard : setBoard,
			hideCandidates : hideCandidates,
			showCandidates : showCandidates,
			setEditingCandidates: setEditingCandidates,
			generateBoard : generateBoard
		};
	};


})(window, jQuery);

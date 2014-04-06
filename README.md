#SudokuJS
##JavaScript Sudoku solver

Live demo on: http://jonassebastianohlsson.com/sudoku/

I got interested in sudoku strategies and decided to write a solver in JavaScript. This solver currently implements basic strategies, enough to solve (non evil) newspaper sudoku puzzles.

SudokuJS comes with a basic GUI for the sudoku board - the board is rendered on the screen, and the board cells listen for keyboard input from a user.

SudokuJS currently requires jQuery.

### Basic Usage

#### Initialization
	<script src='sudokuJS.js'></script>
    <link rel='stylesheet' href='sudokuJS.css' />

    <div id='sudoku'></div>

    <script>
	//array representing a standard sudoku puzzle of size 9
	//use space for empty cells
	var board = [
		 , , ,4, ,8, ,2,9
		, , , , , , , , ,4
		,8,5, , ,2, , , ,7
		, , ,8,3,7,4,2, , 
		, ,2, , , , , , , 
		, , ,3,2,6,1,7, , 
		, , , , ,9,3,6,1,2
		,2, , , , , ,4, ,3
		,1,3, ,6,4,2, ,7,undefined
	]
	//NOTE: if last cell of board is empty 'undefined' has to be used as value!

    var mySudokuJS = $("#sudoku").sudokuJS({
        board: board
    });
    </script>

#### Solving
Solve the puzzle either step by step, or all in one go:

	mySudokuJS.solveStep();
	mySudokuJS.solveAll();
	
#### Analyzing the board
The solver can tell you info about the board before it has been solved.

	var data = mySudokuJS.analyzeBoard();
	
	//data.error -- board is incorrect
	//data.finished === false -- board can't be solvedrequires more advanced strategies 
	
	//if no error, and data.finished === true
	//data.level -- "easy"|"medium"|"hard"
	//data.score -- int [experimental]
	//data.usedStrategies -- [{title, freq}, ..]

#### Candidates
Candidates are hidden when a board loads. To show/hide candidates:
	
	mySudokuJS.showCandidates();
	mySudokuJS.hideCandidates();
	
SudokuJS automatically removes impossible candidates on showCandidates(); candidates that can be eliminated via visualElimination (digit already exists in same house).

#### Clear board
Useful before entering new puzzle, if using keyboard input in the GUI.

	mySudokuJS.clearBoard();
	
### Callbacks
	
#### boardUpdatedFn
Fires whenever the board is updated, whether by user or solver. 

	 $("#sudoku").sudokuJS({
		board: board
		,boardUpdatedFn: function(data){
			//data.cause: "user input" | name of strategy used
			//data.cellsUpdated: [] of indexes for cells updated
			alert("board was updated!");
		}
	});

#### boardFinishedFn
Fires when the board has been completed.

	 $("#sudoku").sudokuJS({
		board: board
		,boardFinishedFn: function(data){
			//ONLY IF board was solved by solver:
			//data.difficultyInfo {
			//	level: "easy", "medium", "hard"
			//	,score: int [experimental]
			//}
			alert("board was finished!");
		}
	});
 

#### boardErrorFn
Fires whenever the board is found to be incorrect, f.e. if solver detects there is no solution to board, or if passed in board is of invalid size.

	 $("#sudoku").sudokuJS({
		board: board
		,boardErrorFn: function(data){
			//data.msg -- f.e. "board incorrect"
			alert("board error!");
		}
	});
 
#### candidateShowToggleFn
 The solver automatically switches to showing candidates when a solve step was invoked which only updated the candidates on the board. To catch this change (for updating UI, etc), there is a callback:

	 $("#sudoku").sudokuJS({
		board: board
		,candidateShowToggleFn: function(showingBoolean){
			alert("candidates showing: " + showingBoolean); //true|false
		}
	}
	

### Extra
The solver is board size agnostic, so you can pass in any valid sudoku sized board (f.e. 4x4, 9x9, 16x16) - however the CSS included only handles 9x9 boards.

### License
MIT
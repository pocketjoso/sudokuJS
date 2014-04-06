#SudokuJS
##JavaScript Sudoku solver

Live demo on: http://jonassebastianohlsson.com/sudoku/

I got interested in sudoku strategies and decided to see whether I could write a solver in JavaScript. This solver currently implements basic strategies, enough to solve (non evil) newspaper sudoku puzzles.

### Basic Usage

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
	//NOTE: if last cell is empty, use 'undefined' instead!

    $("#sudoku").sudokuJS({
        board: board
    });
    </script>
	
### Callbacks
	
#### boardUpdatedFn
Fires whenever the board is updated.

	 $("#sudoku").sudokuJS({
		board: board
		,boardUpdatedFn: function(){
			alert("solver updated the board!");
		}
	});
 

### License
MIT.
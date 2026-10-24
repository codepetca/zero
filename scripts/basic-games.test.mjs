import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGames,assertZeroOnly} from './verify-basic-games.mjs';
test('three complete game source trees use Zero and standard Java only',()=>assert.equal(inspectGames().length,3));
test('game source guard catches toolkit types and inferred bridge use',()=>{
 for(const source of ['import javafx.scene.Node;','class Main { void draw(){ var g=graphics(); }}','class Main { void draw(){ app.fxNode(); }}','import other.Engine;'])assert.throws(()=>assertZeroOnly(source));
 assert.doesNotThrow(()=>assertZeroOnly('import java.util.ArrayList; import zero.Actor; class Player extends Actor { /* javafx is an advanced option */ String note="graphics()"; }'));
});


const loader=document.getElementById('loader');
const gameLayer=document.getElementById('game-layer');
const gameFrame=document.getElementById('game-frame');

window.addEventListener('load',()=>{
setTimeout(()=>{
loader.classList.add('hide');
},1200);
});

function openGame(src){
gameFrame.src=src;
gameLayer.classList.add('active');
document.body.style.overflow='hidden';
}

function closeGame(){
gameLayer.classList.remove('active');

setTimeout(()=>{
gameFrame.src='';
},300);

document.body.style.overflow='auto';
}

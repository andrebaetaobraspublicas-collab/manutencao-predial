/* ==== 34_example_repair.js — v1.8.2: exemplo SP, preços vinculados e plano por frentes ==== */
(function(G){
'use strict';
const OP=G.OP,U=OP.util,E=OP.engine,N=OP.register,A=OP.app,R=OP.res;
const P=OP.sitePlan={version:1}, clone=x=>JSON.parse(JSON.stringify(x));
P.spec={
  "v": 1,
  "phases": [
    {
      "id": "docs",
      "name": "Documentação, segurança e preparação",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "site",
      "name": "Mobilização e instalação do canteiro",
      "minDays": 7,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "survey",
      "name": "Locação e gabarito",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "earth",
      "name": "Limpeza, terraplenagem e plataforma",
      "minDays": 5,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "pile",
      "name": "Mobilização e execução das estacas",
      "minDays": 5,
      "crew": {
        "servente": 4,
        "armador": 3,
        "ajudante": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "pileWait",
      "name": "Reserva para controle e liberação das estacas",
      "minDays": 5,
      "crew": {},
      "note": "Reserva gerencial. A idade, resistência, ensaios e liberação dependem do projeto e da fiscalização; não autoriza carregamento.",
      "family": ""
    },
    {
      "id": "blockExc",
      "name": "Escavação de blocos e arrasamento",
      "minDays": 4,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "pit",
      "name": "Inspeção e ensaios das estacas",
      "minDays": 2,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "blocks",
      "name": "Lastro, fôrmas, armação e concretagem de blocos",
      "minDays": 9,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "baldrame",
      "name": "Vigas baldrame",
      "minDays": 10,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "baldrameWater",
      "name": "Impermeabilização e reaterro da infraestrutura",
      "minDays": 5,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "elevBase",
      "name": "Base do elevador de obra",
      "minDays": 2,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "elevInstall",
      "name": "Montagem inicial do elevador",
      "minDays": 3,
      "crew": {
        "outros": 3,
        "servente": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": ""
    },
    {
      "id": "pill1",
      "name": "Pilares — pavimento 1",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "carpinteiro": 4,
        "ajudante": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "form1",
      "name": "Fôrmas de vigas, lajes e escadas — pavimento 1",
      "minDays": 6,
      "crew": {
        "carpinteiro": 6,
        "ajudante": 3,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "steel1",
      "name": "Armação e instalações embutidas — pavimento 1",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "ajudante": 3,
        "eletricista": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "pour1",
      "name": "Concretagem — pavimento 1",
      "minDays": 1,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 3,
        "servente": 6,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "cure1",
      "name": "Reserva de cura e liberação — pavimento 1",
      "minDays": 5,
      "crew": {},
      "note": "Reserva didática de 5 dias úteis, não prazo normativo de desforma ou resistência. Liberação técnica deve considerar o projeto.",
      "family": "estrutura"
    },
    {
      "id": "masonry1",
      "name": "Alvenaria e vergas — pavimento 1",
      "minDays": 10,
      "crew": {
        "pedreiro": 6,
        "servente": 4,
        "armador": 1,
        "ajudante": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "closing1",
      "name": "Encunhamento e ajustes — pavimento 1",
      "minDays": 2,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "rough1",
      "name": "Rasgos, tubos, caixas e eletrodutos — pavimento 1",
      "minDays": 6,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "pedreiro": 1,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "roughTest1",
      "name": "Testes de instalações antes do fechamento — pavimento 1",
      "minDays": 2,
      "crew": {},
      "note": "Reserva para estanqueidade/continuidade e inspeção. Sem adicionar custo oculto; avaliar cobertura contratual.",
      "family": "instalações"
    },
    {
      "id": "roughClose1",
      "name": "Chumbamento e fechamento de rasgos — pavimento 1",
      "minDays": 2,
      "crew": {
        "encanador": 2,
        "ajudante": 2,
        "pedreiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "chap1",
      "name": "Chapisco interno e tetos — pavimento 1",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "plaster1",
      "name": "Emboço e massa única internos — pavimento 1",
      "minDays": 10,
      "crew": {
        "pedreiro": 4,
        "servente": 4,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "dry1",
      "name": "Reserva de secagem dos revestimentos — pavimento 1",
      "minDays": 7,
      "crew": {},
      "note": "Reserva didática; exigências de substrato/umidade e fabricante prevalecem sobre o número de dias do exemplo.",
      "family": "acabamentos"
    },
    {
      "id": "wet1",
      "name": "Impermeabilização de áreas molhadas — pavimento 1",
      "minDays": 3,
      "crew": {
        "impermeabilizador": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "wetTest1",
      "name": "Reserva para ensaio de estanqueidade — pavimento 1",
      "minDays": 3,
      "crew": {},
      "note": "Janela de verificação da impermeabilização, não certificação de requisito normativo.",
      "family": "acabamentos"
    },
    {
      "id": "baseFloor1",
      "name": "Contrapisos — pavimento 1",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "tile1",
      "name": "Cerâmicas, rodapés e soleiras — pavimento 1",
      "minDays": 8,
      "crew": {
        "azulejista": 3,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "ceiling1",
      "name": "Forros de gesso — pavimento 1",
      "minDays": 3,
      "crew": {
        "gesseiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "frame1",
      "name": "Esquadrias e vidros — pavimento 1",
      "minDays": 5,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 2,
        "servente": 3,
        "vidraceiro": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "primer1",
      "name": "Preparação e seladores — pavimento 1",
      "minDays": 2,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "putty1",
      "name": "Emassamento e lixamento — pavimento 1",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "paint1",
      "name": "Pintura e vernizes — pavimento 1",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "finalFit1",
      "name": "Louças, metais e acabamentos elétricos — pavimento 1",
      "minDays": 5,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "pill2",
      "name": "Pilares — pavimento 2",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "carpinteiro": 4,
        "ajudante": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "form2",
      "name": "Fôrmas de vigas, lajes e escadas — pavimento 2",
      "minDays": 6,
      "crew": {
        "carpinteiro": 6,
        "ajudante": 3,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "steel2",
      "name": "Armação e instalações embutidas — pavimento 2",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "ajudante": 3,
        "eletricista": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "pour2",
      "name": "Concretagem — pavimento 2",
      "minDays": 1,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 3,
        "servente": 6,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "cure2",
      "name": "Reserva de cura e liberação — pavimento 2",
      "minDays": 5,
      "crew": {},
      "note": "Reserva didática de 5 dias úteis, não prazo normativo de desforma ou resistência. Liberação técnica deve considerar o projeto.",
      "family": "estrutura"
    },
    {
      "id": "masonry2",
      "name": "Alvenaria e vergas — pavimento 2",
      "minDays": 10,
      "crew": {
        "pedreiro": 6,
        "servente": 4,
        "armador": 1,
        "ajudante": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "closing2",
      "name": "Encunhamento e ajustes — pavimento 2",
      "minDays": 2,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "rough2",
      "name": "Rasgos, tubos, caixas e eletrodutos — pavimento 2",
      "minDays": 6,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "pedreiro": 1,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "roughTest2",
      "name": "Testes de instalações antes do fechamento — pavimento 2",
      "minDays": 2,
      "crew": {},
      "note": "Reserva para estanqueidade/continuidade e inspeção. Sem adicionar custo oculto; avaliar cobertura contratual.",
      "family": "instalações"
    },
    {
      "id": "roughClose2",
      "name": "Chumbamento e fechamento de rasgos — pavimento 2",
      "minDays": 2,
      "crew": {
        "encanador": 2,
        "ajudante": 2,
        "pedreiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "chap2",
      "name": "Chapisco interno e tetos — pavimento 2",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "plaster2",
      "name": "Emboço e massa única internos — pavimento 2",
      "minDays": 10,
      "crew": {
        "pedreiro": 4,
        "servente": 4,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "dry2",
      "name": "Reserva de secagem dos revestimentos — pavimento 2",
      "minDays": 7,
      "crew": {},
      "note": "Reserva didática; exigências de substrato/umidade e fabricante prevalecem sobre o número de dias do exemplo.",
      "family": "acabamentos"
    },
    {
      "id": "wet2",
      "name": "Impermeabilização de áreas molhadas — pavimento 2",
      "minDays": 3,
      "crew": {
        "impermeabilizador": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "wetTest2",
      "name": "Reserva para ensaio de estanqueidade — pavimento 2",
      "minDays": 3,
      "crew": {},
      "note": "Janela de verificação da impermeabilização, não certificação de requisito normativo.",
      "family": "acabamentos"
    },
    {
      "id": "baseFloor2",
      "name": "Contrapisos — pavimento 2",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "tile2",
      "name": "Cerâmicas, rodapés e soleiras — pavimento 2",
      "minDays": 8,
      "crew": {
        "azulejista": 3,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "ceiling2",
      "name": "Forros de gesso — pavimento 2",
      "minDays": 3,
      "crew": {
        "gesseiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "frame2",
      "name": "Esquadrias e vidros — pavimento 2",
      "minDays": 5,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 2,
        "servente": 3,
        "vidraceiro": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "primer2",
      "name": "Preparação e seladores — pavimento 2",
      "minDays": 2,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "putty2",
      "name": "Emassamento e lixamento — pavimento 2",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "paint2",
      "name": "Pintura e vernizes — pavimento 2",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "finalFit2",
      "name": "Louças, metais e acabamentos elétricos — pavimento 2",
      "minDays": 5,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "pill3",
      "name": "Pilares — pavimento 3",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "carpinteiro": 4,
        "ajudante": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "form3",
      "name": "Fôrmas de vigas, lajes e escadas — pavimento 3",
      "minDays": 6,
      "crew": {
        "carpinteiro": 6,
        "ajudante": 3,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "steel3",
      "name": "Armação e instalações embutidas — pavimento 3",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "ajudante": 3,
        "eletricista": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "pour3",
      "name": "Concretagem — pavimento 3",
      "minDays": 1,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 3,
        "servente": 6,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "cure3",
      "name": "Reserva de cura e liberação — pavimento 3",
      "minDays": 5,
      "crew": {},
      "note": "Reserva didática de 5 dias úteis, não prazo normativo de desforma ou resistência. Liberação técnica deve considerar o projeto.",
      "family": "estrutura"
    },
    {
      "id": "masonry3",
      "name": "Alvenaria e vergas — pavimento 3",
      "minDays": 10,
      "crew": {
        "pedreiro": 6,
        "servente": 4,
        "armador": 1,
        "ajudante": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "closing3",
      "name": "Encunhamento e ajustes — pavimento 3",
      "minDays": 2,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "rough3",
      "name": "Rasgos, tubos, caixas e eletrodutos — pavimento 3",
      "minDays": 6,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "pedreiro": 1,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "roughTest3",
      "name": "Testes de instalações antes do fechamento — pavimento 3",
      "minDays": 2,
      "crew": {},
      "note": "Reserva para estanqueidade/continuidade e inspeção. Sem adicionar custo oculto; avaliar cobertura contratual.",
      "family": "instalações"
    },
    {
      "id": "roughClose3",
      "name": "Chumbamento e fechamento de rasgos — pavimento 3",
      "minDays": 2,
      "crew": {
        "encanador": 2,
        "ajudante": 2,
        "pedreiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "chap3",
      "name": "Chapisco interno e tetos — pavimento 3",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "plaster3",
      "name": "Emboço e massa única internos — pavimento 3",
      "minDays": 10,
      "crew": {
        "pedreiro": 4,
        "servente": 4,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "dry3",
      "name": "Reserva de secagem dos revestimentos — pavimento 3",
      "minDays": 7,
      "crew": {},
      "note": "Reserva didática; exigências de substrato/umidade e fabricante prevalecem sobre o número de dias do exemplo.",
      "family": "acabamentos"
    },
    {
      "id": "wet3",
      "name": "Impermeabilização de áreas molhadas — pavimento 3",
      "minDays": 3,
      "crew": {
        "impermeabilizador": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "wetTest3",
      "name": "Reserva para ensaio de estanqueidade — pavimento 3",
      "minDays": 3,
      "crew": {},
      "note": "Janela de verificação da impermeabilização, não certificação de requisito normativo.",
      "family": "acabamentos"
    },
    {
      "id": "baseFloor3",
      "name": "Contrapisos — pavimento 3",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "tile3",
      "name": "Cerâmicas, rodapés e soleiras — pavimento 3",
      "minDays": 8,
      "crew": {
        "azulejista": 3,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "ceiling3",
      "name": "Forros de gesso — pavimento 3",
      "minDays": 3,
      "crew": {
        "gesseiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "frame3",
      "name": "Esquadrias e vidros — pavimento 3",
      "minDays": 5,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 2,
        "servente": 3,
        "vidraceiro": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "primer3",
      "name": "Preparação e seladores — pavimento 3",
      "minDays": 2,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "putty3",
      "name": "Emassamento e lixamento — pavimento 3",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "paint3",
      "name": "Pintura e vernizes — pavimento 3",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "finalFit3",
      "name": "Louças, metais e acabamentos elétricos — pavimento 3",
      "minDays": 5,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "pill4",
      "name": "Pilares — pavimento 4",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "carpinteiro": 4,
        "ajudante": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "form4",
      "name": "Fôrmas de vigas, lajes e escadas — pavimento 4",
      "minDays": 6,
      "crew": {
        "carpinteiro": 6,
        "ajudante": 3,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "steel4",
      "name": "Armação e instalações embutidas — pavimento 4",
      "minDays": 5,
      "crew": {
        "armador": 4,
        "ajudante": 3,
        "eletricista": 2,
        "servente": 3,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "pour4",
      "name": "Concretagem — pavimento 4",
      "minDays": 1,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 3,
        "servente": 6,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "estrutura"
    },
    {
      "id": "cure4",
      "name": "Reserva de cura e liberação — pavimento 4",
      "minDays": 5,
      "crew": {},
      "note": "Reserva didática de 5 dias úteis, não prazo normativo de desforma ou resistência. Liberação técnica deve considerar o projeto.",
      "family": "estrutura"
    },
    {
      "id": "masonry4",
      "name": "Alvenaria e vergas — pavimento 4",
      "minDays": 10,
      "crew": {
        "pedreiro": 6,
        "servente": 4,
        "armador": 1,
        "ajudante": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "closing4",
      "name": "Encunhamento e ajustes — pavimento 4",
      "minDays": 2,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "vedação"
    },
    {
      "id": "rough4",
      "name": "Rasgos, tubos, caixas e eletrodutos — pavimento 4",
      "minDays": 6,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "pedreiro": 1,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "roughTest4",
      "name": "Testes de instalações antes do fechamento — pavimento 4",
      "minDays": 2,
      "crew": {},
      "note": "Reserva para estanqueidade/continuidade e inspeção. Sem adicionar custo oculto; avaliar cobertura contratual.",
      "family": "instalações"
    },
    {
      "id": "roughClose4",
      "name": "Chumbamento e fechamento de rasgos — pavimento 4",
      "minDays": 2,
      "crew": {
        "encanador": 2,
        "ajudante": 2,
        "pedreiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "chap4",
      "name": "Chapisco interno e tetos — pavimento 4",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "plaster4",
      "name": "Emboço e massa única internos — pavimento 4",
      "minDays": 10,
      "crew": {
        "pedreiro": 4,
        "servente": 4,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "dry4",
      "name": "Reserva de secagem dos revestimentos — pavimento 4",
      "minDays": 7,
      "crew": {},
      "note": "Reserva didática; exigências de substrato/umidade e fabricante prevalecem sobre o número de dias do exemplo.",
      "family": "acabamentos"
    },
    {
      "id": "wet4",
      "name": "Impermeabilização de áreas molhadas — pavimento 4",
      "minDays": 3,
      "crew": {
        "impermeabilizador": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "wetTest4",
      "name": "Reserva para ensaio de estanqueidade — pavimento 4",
      "minDays": 3,
      "crew": {},
      "note": "Janela de verificação da impermeabilização, não certificação de requisito normativo.",
      "family": "acabamentos"
    },
    {
      "id": "baseFloor4",
      "name": "Contrapisos — pavimento 4",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "tile4",
      "name": "Cerâmicas, rodapés e soleiras — pavimento 4",
      "minDays": 8,
      "crew": {
        "azulejista": 3,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "ceiling4",
      "name": "Forros de gesso — pavimento 4",
      "minDays": 3,
      "crew": {
        "gesseiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "frame4",
      "name": "Esquadrias e vidros — pavimento 4",
      "minDays": 5,
      "crew": {
        "carpinteiro": 3,
        "pedreiro": 2,
        "servente": 3,
        "vidraceiro": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "primer4",
      "name": "Preparação e seladores — pavimento 4",
      "minDays": 2,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "putty4",
      "name": "Emassamento e lixamento — pavimento 4",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "paint4",
      "name": "Pintura e vernizes — pavimento 4",
      "minDays": 5,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "finalFit4",
      "name": "Louças, metais e acabamentos elétricos — pavimento 4",
      "minDays": 5,
      "crew": {
        "encanador": 2,
        "eletricista": 2,
        "ajudante": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "acabamentos"
    },
    {
      "id": "roofWood",
      "name": "Tratamento, pontaletes e trama da cobertura",
      "minDays": 5,
      "crew": {
        "carpinteiro": 3,
        "ajudante": 2,
        "servente": 3,
        "pintor": 1,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "cobertura"
    },
    {
      "id": "roofTile",
      "name": "Telhamento, calhas e rufos",
      "minDays": 5,
      "crew": {
        "telhadista": 3,
        "servente": 3,
        "encanador": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "cobertura"
    },
    {
      "id": "roofWater",
      "name": "Impermeabilização e teste da cobertura",
      "minDays": 5,
      "crew": {
        "impermeabilizador": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "cobertura"
    },
    {
      "id": "roofEnd",
      "name": "Proteção mecânica e conclusão da cobertura",
      "minDays": 3,
      "crew": {
        "carpinteiro": 4,
        "ajudante": 2,
        "pedreiro": 3,
        "servente": 4,
        "armador": 3,
        "eletricista": 2,
        "encanador": 2,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "cobertura"
    },
    {
      "id": "scaffold",
      "name": "Montagem dos andaimes e tela de fachada",
      "minDays": 7,
      "crew": {
        "montador": 4,
        "servente": 3,
        "carpinteiro": 2,
        "ajudante": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "extChap",
      "name": "Chapisco externo",
      "minDays": 4,
      "crew": {
        "pedreiro": 3,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "extPlaster",
      "name": "Revestimentos externos",
      "minDays": 18,
      "crew": {
        "pedreiro": 4,
        "servente": 4,
        "outros": 2,
        "equipamento": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "extDry",
      "name": "Reserva de secagem da fachada",
      "minDays": 7,
      "crew": {},
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "extPrimer",
      "name": "Selador externo",
      "minDays": 3,
      "crew": {
        "pintor": 3,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "extPaint",
      "name": "Pintura externa",
      "minDays": 10,
      "crew": {
        "pintor": 3,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "scaffoldOut",
      "name": "Desmontagem dos andaimes",
      "minDays": 3,
      "crew": {
        "montador": 4,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "fachada"
    },
    {
      "id": "elevOut",
      "name": "Descida e desmontagem do elevador",
      "minDays": 3,
      "crew": {
        "outros": 3,
        "servente": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "apoios"
    },
    {
      "id": "externalNetworks",
      "name": "Redes externas e ligações definitivas",
      "minDays": 8,
      "crew": {
        "encanador": 3,
        "eletricista": 2,
        "ajudante": 3,
        "pedreiro": 2,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "áreas externas"
    },
    {
      "id": "spda",
      "name": "Captação e interligação do SPDA",
      "minDays": 5,
      "crew": {
        "eletricista": 2,
        "ajudante": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "gas",
      "name": "Central e ramais de gás",
      "minDays": 5,
      "crew": {
        "encanador": 2,
        "ajudante": 2,
        "pedreiro": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "instalações"
    },
    {
      "id": "wall",
      "name": "Muro, gradil e portões",
      "minDays": 12,
      "crew": {
        "pedreiro": 3,
        "servente": 3,
        "serralheiro": 2,
        "ajudante": 2,
        "pintor": 1,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "áreas externas"
    },
    {
      "id": "paving",
      "name": "Calçadas, rampas e mobiliário",
      "minDays": 7,
      "crew": {
        "pedreiro": 3,
        "servente": 3,
        "serralheiro": 2,
        "ajudante": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "áreas externas"
    },
    {
      "id": "landscape",
      "name": "Jardinagem e paisagismo",
      "minDays": 5,
      "crew": {
        "jardineiro": 2,
        "servente": 3,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "áreas externas"
    },
    {
      "id": "safetyFinal",
      "name": "Equipamentos finais, antena e sinalização",
      "minDays": 4,
      "crew": {
        "eletricista": 2,
        "encanador": 2,
        "ajudante": 2,
        "servente": 2,
        "outros": 2
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "entrega"
    },
    {
      "id": "commission",
      "name": "Comissionamento e verificações finais",
      "minDays": 5,
      "crew": {},
      "note": "Inspeção conjunta de sistemas; carga de trabalho estimada e separada dos coeficientes SINAPI.",
      "family": "entrega"
    },
    {
      "id": "cleanup",
      "name": "Limpeza fina e desmobilização",
      "minDays": 6,
      "crew": {
        "servente": 6,
        "outros": 2,
        "equipamento": 1
      },
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "entrega"
    },
    {
      "id": "handover",
      "name": "As built, manual e entrega da obra",
      "minDays": 5,
      "crew": {},
      "note": "Janela de planejamento inferida para o exemplo; não é prazo oficial do SINAPI.",
      "family": "entrega"
    }
  ],
  "links": [
    {
      "from": "docs",
      "to": "site",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "site",
      "to": "survey",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "survey",
      "to": "earth",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "earth",
      "to": "pile",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pile",
      "to": "pileWait",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pileWait",
      "to": "blockExc",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "blockExc",
      "to": "pit",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pit",
      "to": "blocks",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "blocks",
      "to": "baldrame",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "baldrame",
      "to": "baldrameWater",
      "type": "FS",
      "lag": 3
    },
    {
      "from": "baldrameWater",
      "to": "elevBase",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "elevBase",
      "to": "elevInstall",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "baldrameWater",
      "to": "pill1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pill1",
      "to": "form1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "form1",
      "to": "steel1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "steel1",
      "to": "pour1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pour1",
      "to": "cure1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure1",
      "to": "masonry1",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry1",
      "to": "closing1",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry1",
      "to": "rough1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough1",
      "to": "roughTest1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughTest1",
      "to": "roughClose1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "closing1",
      "to": "chap1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughClose1",
      "to": "chap1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "chap1",
      "to": "plaster1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster1",
      "to": "dry1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "dry1",
      "to": "wet1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wet1",
      "to": "wetTest1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wetTest1",
      "to": "baseFloor1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "baseFloor1",
      "to": "tile1",
      "type": "FS",
      "lag": 3
    },
    {
      "from": "dry1",
      "to": "ceiling1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "ceiling1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile1",
      "to": "frame1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling1",
      "to": "frame1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame1",
      "to": "primer1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "primer1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "primer1",
      "to": "putty1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "putty1",
      "to": "paint1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint1",
      "to": "finalFit1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure1",
      "to": "pill2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pill2",
      "to": "form2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "form2",
      "to": "steel2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "steel2",
      "to": "pour2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pour2",
      "to": "cure2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure2",
      "to": "masonry2",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry2",
      "to": "closing2",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry2",
      "to": "rough2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough2",
      "to": "roughTest2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughTest2",
      "to": "roughClose2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "closing2",
      "to": "chap2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughClose2",
      "to": "chap2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "chap2",
      "to": "plaster2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster2",
      "to": "dry2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "dry2",
      "to": "wet2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wet2",
      "to": "wetTest2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wetTest2",
      "to": "baseFloor2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "baseFloor2",
      "to": "tile2",
      "type": "FS",
      "lag": 3
    },
    {
      "from": "dry2",
      "to": "ceiling2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "ceiling2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile2",
      "to": "frame2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling2",
      "to": "frame2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame2",
      "to": "primer2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "primer2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "primer2",
      "to": "putty2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "putty2",
      "to": "paint2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint2",
      "to": "finalFit2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "masonry1",
      "to": "masonry2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough1",
      "to": "rough2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster1",
      "to": "plaster2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile1",
      "to": "tile2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame1",
      "to": "frame2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "finalFit1",
      "to": "finalFit2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint1",
      "to": "primer2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure2",
      "to": "pill3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pill3",
      "to": "form3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "form3",
      "to": "steel3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "steel3",
      "to": "pour3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pour3",
      "to": "cure3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure3",
      "to": "masonry3",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry3",
      "to": "closing3",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry3",
      "to": "rough3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough3",
      "to": "roughTest3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughTest3",
      "to": "roughClose3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "closing3",
      "to": "chap3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughClose3",
      "to": "chap3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "chap3",
      "to": "plaster3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster3",
      "to": "dry3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "dry3",
      "to": "wet3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wet3",
      "to": "wetTest3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wetTest3",
      "to": "baseFloor3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "baseFloor3",
      "to": "tile3",
      "type": "FS",
      "lag": 3
    },
    {
      "from": "dry3",
      "to": "ceiling3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "ceiling3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile3",
      "to": "frame3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling3",
      "to": "frame3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame3",
      "to": "primer3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "primer3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "primer3",
      "to": "putty3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "putty3",
      "to": "paint3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint3",
      "to": "finalFit3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "masonry2",
      "to": "masonry3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough2",
      "to": "rough3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster2",
      "to": "plaster3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile2",
      "to": "tile3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame2",
      "to": "frame3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "finalFit2",
      "to": "finalFit3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint2",
      "to": "primer3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure3",
      "to": "pill4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pill4",
      "to": "form4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "form4",
      "to": "steel4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "steel4",
      "to": "pour4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "pour4",
      "to": "cure4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure4",
      "to": "masonry4",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry4",
      "to": "closing4",
      "type": "FS",
      "lag": 5
    },
    {
      "from": "masonry4",
      "to": "rough4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough4",
      "to": "roughTest4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughTest4",
      "to": "roughClose4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "closing4",
      "to": "chap4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roughClose4",
      "to": "chap4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "chap4",
      "to": "plaster4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster4",
      "to": "dry4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "dry4",
      "to": "wet4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wet4",
      "to": "wetTest4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wetTest4",
      "to": "baseFloor4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "baseFloor4",
      "to": "tile4",
      "type": "FS",
      "lag": 3
    },
    {
      "from": "dry4",
      "to": "ceiling4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "ceiling4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile4",
      "to": "frame4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling4",
      "to": "frame4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame4",
      "to": "primer4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "primer4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "primer4",
      "to": "putty4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "putty4",
      "to": "paint4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint4",
      "to": "finalFit4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "masonry3",
      "to": "masonry4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "rough3",
      "to": "rough4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "plaster3",
      "to": "plaster4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "tile3",
      "to": "tile4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "frame3",
      "to": "frame4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "finalFit3",
      "to": "finalFit4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paint3",
      "to": "primer4",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure4",
      "to": "roofWood",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofWood",
      "to": "roofTile",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofTile",
      "to": "roofWater",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofWater",
      "to": "roofEnd",
      "type": "FS",
      "lag": 3
    },
    {
      "from": "closing4",
      "to": "scaffold",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofTile",
      "to": "scaffold",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "scaffold",
      "to": "extChap",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "extChap",
      "to": "extPlaster",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "extPlaster",
      "to": "extDry",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "extDry",
      "to": "extPrimer",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "extPrimer",
      "to": "extPaint",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "extPaint",
      "to": "scaffoldOut",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "elevOut",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "closing4",
      "to": "elevOut",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cure4",
      "to": "externalNetworks",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "roofEnd",
      "to": "spda",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "externalNetworks",
      "to": "gas",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "externalNetworks",
      "to": "wall",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "wall",
      "to": "paving",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "scaffoldOut",
      "to": "paving",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "elevOut",
      "to": "paving",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "paving",
      "to": "landscape",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "finalFit4",
      "to": "safetyFinal",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "spda",
      "to": "safetyFinal",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "gas",
      "to": "safetyFinal",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "safetyFinal",
      "to": "commission",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "landscape",
      "to": "commission",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "commission",
      "to": "cleanup",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "cleanup",
      "to": "handover",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "elevInstall",
      "to": "pill1",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling1",
      "to": "ceiling2",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling2",
      "to": "ceiling3",
      "type": "FS",
      "lag": 0
    },
    {
      "from": "ceiling3",
      "to": "ceiling4",
      "type": "FS",
      "lag": 0
    }
  ],
  "items": {
    "1.1": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.2": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.3": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.4": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.5": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.6": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.7": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.8": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.9": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas.",
      "estimated": [
        {
          "name": "Eletricista",
          "hPerUnit": 24
        },
        {
          "name": "Auxiliar de eletricista",
          "hPerUnit": 24
        }
      ]
    },
    "1.10": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 16
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 16
        }
      ]
    },
    "1.11": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.16": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.17": {
      "slices": [
        {
          "phase": "survey",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.22": {
      "slices": [
        {
          "phase": "elevBase",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.23": {
      "slices": [
        {
          "phase": "scaffold",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.27": {
      "slices": [
        {
          "phase": "docs",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.28": {
      "slices": [
        {
          "phase": "docs",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.29": {
      "slices": [
        {
          "phase": "docs",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "1.12": {
      "slices": [
        {
          "phase": "site",
          "share": 0.5
        },
        {
          "phase": "cleanup",
          "share": 0.5
        }
      ],
      "reason": "Instalação e retirada dos módulos em duas mobilizações; repartição didática 50%/50%."
    },
    "1.13": {
      "span": {
        "start": "docs",
        "end": "handover"
      },
      "reason": "Contêiner disponível durante toda a execução; medição proporcional aos dias corridos / 30.",
      "periodic": {
        "multiplier": 1,
        "mode": "month"
      }
    },
    "1.14": {
      "span": {
        "start": "docs",
        "end": "handover"
      },
      "reason": "Contêiner disponível durante toda a execução; medição proporcional aos dias corridos / 30.",
      "periodic": {
        "multiplier": 1,
        "mode": "month"
      }
    },
    "1.15": {
      "span": {
        "start": "docs",
        "end": "handover"
      },
      "reason": "Contêiner disponível durante toda a execução; medição proporcional aos dias corridos / 30.",
      "periodic": {
        "multiplier": 2,
        "mode": "month"
      }
    },
    "1.18": {
      "span": {
        "start": "docs",
        "end": "handover"
      },
      "reason": "Administração local acompanha toda a execução, até a entrega; equipe mensal da memória original, reprecificada quando há SINAPI.",
      "periodic": {
        "multiplier": 1,
        "mode": "month"
      },
      "staff": [
        {
          "name": "Engenheiro civil júnior — administração",
          "fte": 0.2
        },
        {
          "name": "Mestre de obras — administração",
          "fte": 1
        },
        {
          "name": "Servente — administração",
          "fte": 0.5
        },
        {
          "name": "Vigia noturno — posto equivalente",
          "fte": 1,
          "shift": "noite"
        }
      ]
    },
    "1.19": {
      "span": {
        "start": "elevInstall",
        "end": "elevOut"
      },
      "reason": "Locação cobre estrutura, alvenarias e cobertura, incluindo montagem e retirada. Tipo da máquina da cotação original demanda compatibilização.",
      "periodic": {
        "multiplier": 1,
        "mode": "month"
      },
      "availability": [
        {
          "name": "Elevador de obra — disponibilidade locada (tecnologia a conferir)",
          "units": 1
        }
      ]
    },
    "1.20": {
      "slices": [
        {
          "phase": "elevInstall",
          "share": 0.75
        },
        {
          "phase": "elevOut",
          "share": 0.25
        }
      ],
      "reason": "Montagem e desmontagem em duas campanhas; 75%/25% dos consumos, hipótese didática."
    },
    "1.21": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.1875
        },
        {
          "phase": "form2",
          "share": 0.1875
        },
        {
          "phase": "form3",
          "share": 0.1875
        },
        {
          "phase": "form4",
          "share": 0.1875
        },
        {
          "phase": "elevOut",
          "share": 0.25
        }
      ],
      "reason": "Ascensão acompanha os pavimentos; descida concentrada na retirada. Quantidade física original preservada."
    },
    "1.24": {
      "slices": [
        {
          "phase": "scaffold",
          "share": 0.75
        },
        {
          "phase": "scaffoldOut",
          "share": 0.25
        }
      ],
      "reason": "Janela entre montagem e desmontagem cobre revestimentos e pintura externos. Recursos somente nos dois serviços, não continuamente na janela."
    },
    "1.25": {
      "span": {
        "start": "scaffold",
        "end": "scaffoldOut"
      },
      "reason": "Andaime alugado durante a fachada, incluindo montagem e retirada. Área de 720 m² × dias corridos / 30.",
      "periodic": {
        "multiplier": 720,
        "mode": "month"
      }
    },
    "1.26": {
      "span": {
        "start": "earth",
        "end": "cleanup"
      },
      "reason": "Remoção de entulho distribuída ao longo da geração; quantidade e preço históricos mantidos."
    },
    "2.1": {
      "slices": [
        {
          "phase": "pile",
          "share": 0.14285714285714285
        },
        {
          "phase": "blocks",
          "share": 0.14285714285714285
        },
        {
          "phase": "baldrame",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour1",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour2",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour3",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour4",
          "share": 0.14285714285714285
        }
      ],
      "reason": "Amostragem acompanha lotes de concretagem; emissão de resultados está incluída nas reservas de controle, sem duplicar os quantitativos."
    },
    "2.2": {
      "slices": [
        {
          "phase": "blocks",
          "share": 0.2
        },
        {
          "phase": "plaster1",
          "share": 0.2
        },
        {
          "phase": "plaster2",
          "share": 0.2
        },
        {
          "phase": "plaster3",
          "share": 0.2
        },
        {
          "phase": "plaster4",
          "share": 0.2
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.3": {
      "slices": [
        {
          "phase": "pile",
          "share": 0.14285714285714285
        },
        {
          "phase": "blocks",
          "share": 0.14285714285714285
        },
        {
          "phase": "baldrame",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour1",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour2",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour3",
          "share": 0.14285714285714285
        },
        {
          "phase": "pour4",
          "share": 0.14285714285714285
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.4": {
      "slices": [
        {
          "phase": "pile",
          "share": 0.3333333333333333
        },
        {
          "phase": "steel1",
          "share": 0.3333333333333333
        },
        {
          "phase": "steel3",
          "share": 0.3333333333333333
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.5": {
      "slices": [
        {
          "phase": "masonry1",
          "share": 0.25
        },
        {
          "phase": "masonry2",
          "share": 0.25
        },
        {
          "phase": "masonry3",
          "share": 0.25
        },
        {
          "phase": "masonry4",
          "share": 0.25
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.6": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.7": {
      "slices": [
        {
          "phase": "cure1",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.8": {
      "slices": [
        {
          "phase": "earth",
          "share": 0.25
        },
        {
          "phase": "masonry1",
          "share": 0.25
        },
        {
          "phase": "plaster1",
          "share": 0.25
        },
        {
          "phase": "extPlaster",
          "share": 0.25
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "2.9": {
      "slices": [
        {
          "phase": "pit",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "3.1": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Proteção coletiva instalada progressivamente por pavimento; não é uma atividade isolada no início da obra."
    },
    "3.2": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Proteção coletiva instalada progressivamente por pavimento; não é uma atividade isolada no início da obra."
    },
    "3.3": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Proteção coletiva instalada progressivamente por pavimento; não é uma atividade isolada no início da obra."
    },
    "3.4": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Proteção coletiva instalada progressivamente por pavimento; não é uma atividade isolada no início da obra."
    },
    "3.8": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Proteção coletiva instalada progressivamente por pavimento; não é uma atividade isolada no início da obra."
    },
    "3.5": {
      "slices": [
        {
          "phase": "site",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "3.6": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "3.7": {
      "slices": [
        {
          "phase": "blocks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.1.1": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.1.2": {
      "slices": [
        {
          "phase": "baldrameWater",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.1.3": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.1.4": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Servente",
          "hPerUnit": 0.03
        }
      ]
    },
    "4.1.5": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.2.1": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.2.2": {
      "slices": [
        {
          "phase": "pile",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.2.3": {
      "slices": [
        {
          "phase": "pile",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.2.4": {
      "slices": [
        {
          "phase": "blockExc",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.3.5": {
      "slices": [
        {
          "phase": "blockExc",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.4.2": {
      "slices": [
        {
          "phase": "baldrameWater",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.3.1": {
      "slices": [
        {
          "phase": "blocks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.3.2": {
      "slices": [
        {
          "phase": "blocks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.3.3": {
      "slices": [
        {
          "phase": "blocks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.3.4": {
      "slices": [
        {
          "phase": "blocks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.4.1": {
      "slices": [
        {
          "phase": "baldrame",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.4.3": {
      "slices": [
        {
          "phase": "baldrame",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.4.4": {
      "slices": [
        {
          "phase": "baldrame",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "4.4.5": {
      "slices": [
        {
          "phase": "baldrame",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.1.1": {
      "slices": [
        {
          "phase": "pill1",
          "share": 0.25
        },
        {
          "phase": "pill2",
          "share": 0.25
        },
        {
          "phase": "pill3",
          "share": 0.25
        },
        {
          "phase": "pill4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.1.2": {
      "slices": [
        {
          "phase": "pill1",
          "share": 0.25
        },
        {
          "phase": "pill2",
          "share": 0.25
        },
        {
          "phase": "pill3",
          "share": 0.25
        },
        {
          "phase": "pill4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.1.3": {
      "slices": [
        {
          "phase": "pill1",
          "share": 0.25
        },
        {
          "phase": "pill2",
          "share": 0.25
        },
        {
          "phase": "pill3",
          "share": 0.25
        },
        {
          "phase": "pill4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.1.4": {
      "slices": [
        {
          "phase": "pill1",
          "share": 0.25
        },
        {
          "phase": "pill2",
          "share": 0.25
        },
        {
          "phase": "pill3",
          "share": 0.25
        },
        {
          "phase": "pill4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.2.1": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.2.2": {
      "slices": [
        {
          "phase": "pour1",
          "share": 0.25
        },
        {
          "phase": "pour2",
          "share": 0.25
        },
        {
          "phase": "pour3",
          "share": 0.25
        },
        {
          "phase": "pour4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.2.3": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.2.4": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.2.5": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.2.6": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.3.1": {
      "slices": [
        {
          "phase": "form1",
          "share": 0.25
        },
        {
          "phase": "form2",
          "share": 0.25
        },
        {
          "phase": "form3",
          "share": 0.25
        },
        {
          "phase": "form4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.3.2": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.3.3": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "5.3.4": {
      "slices": [
        {
          "phase": "pour1",
          "share": 0.25
        },
        {
          "phase": "pour2",
          "share": 0.25
        },
        {
          "phase": "pour3",
          "share": 0.25
        },
        {
          "phase": "pour4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "6.1": {
      "slices": [
        {
          "phase": "masonry1",
          "share": 0.25
        },
        {
          "phase": "masonry2",
          "share": 0.25
        },
        {
          "phase": "masonry3",
          "share": 0.25
        },
        {
          "phase": "masonry4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "6.2": {
      "slices": [
        {
          "phase": "masonry1",
          "share": 0.25
        },
        {
          "phase": "masonry2",
          "share": 0.25
        },
        {
          "phase": "masonry3",
          "share": 0.25
        },
        {
          "phase": "masonry4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "6.3": {
      "slices": [
        {
          "phase": "masonry1",
          "share": 0.25
        },
        {
          "phase": "masonry2",
          "share": 0.25
        },
        {
          "phase": "masonry3",
          "share": 0.25
        },
        {
          "phase": "masonry4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "6.4": {
      "slices": [
        {
          "phase": "masonry1",
          "share": 0.25
        },
        {
          "phase": "masonry2",
          "share": 0.25
        },
        {
          "phase": "masonry3",
          "share": 0.25
        },
        {
          "phase": "masonry4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "6.5": {
      "slices": [
        {
          "phase": "closing1",
          "share": 0.25
        },
        {
          "phase": "closing2",
          "share": 0.25
        },
        {
          "phase": "closing3",
          "share": 0.25
        },
        {
          "phase": "closing4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.1.1": {
      "slices": [
        {
          "phase": "frame1",
          "share": 0.25
        },
        {
          "phase": "frame2",
          "share": 0.25
        },
        {
          "phase": "frame3",
          "share": 0.25
        },
        {
          "phase": "frame4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.1.2": {
      "slices": [
        {
          "phase": "frame1",
          "share": 0.25
        },
        {
          "phase": "frame2",
          "share": 0.25
        },
        {
          "phase": "frame3",
          "share": 0.25
        },
        {
          "phase": "frame4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.1.3": {
      "slices": [
        {
          "phase": "frame1",
          "share": 0.25
        },
        {
          "phase": "frame2",
          "share": 0.25
        },
        {
          "phase": "frame3",
          "share": 0.25
        },
        {
          "phase": "frame4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.2.1": {
      "slices": [
        {
          "phase": "roughClose1",
          "share": 0.25
        },
        {
          "phase": "roughClose2",
          "share": 0.25
        },
        {
          "phase": "roughClose3",
          "share": 0.25
        },
        {
          "phase": "roughClose4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.2.2": {
      "slices": [
        {
          "phase": "roughClose1",
          "share": 0.25
        },
        {
          "phase": "roughClose2",
          "share": 0.25
        },
        {
          "phase": "roughClose3",
          "share": 0.25
        },
        {
          "phase": "roughClose4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.2.3": {
      "slices": [
        {
          "phase": "roughClose1",
          "share": 0.25
        },
        {
          "phase": "roughClose2",
          "share": 0.25
        },
        {
          "phase": "roughClose3",
          "share": 0.25
        },
        {
          "phase": "roughClose4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.2.4": {
      "slices": [
        {
          "phase": "frame1",
          "share": 0.25
        },
        {
          "phase": "frame2",
          "share": 0.25
        },
        {
          "phase": "frame3",
          "share": 0.25
        },
        {
          "phase": "frame4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.2.5": {
      "slices": [
        {
          "phase": "frame1",
          "share": 0.25
        },
        {
          "phase": "frame2",
          "share": 0.25
        },
        {
          "phase": "frame3",
          "share": 0.25
        },
        {
          "phase": "frame4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.2.6": {
      "slices": [
        {
          "phase": "roughClose1",
          "share": 0.25
        },
        {
          "phase": "roughClose2",
          "share": 0.25
        },
        {
          "phase": "roughClose3",
          "share": 0.25
        },
        {
          "phase": "roughClose4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.3.1": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.3.2": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "7.4.1": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.1": {
      "slices": [
        {
          "phase": "roofWood",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.2": {
      "slices": [
        {
          "phase": "roofTile",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.3": {
      "slices": [
        {
          "phase": "roofWood",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.4": {
      "slices": [
        {
          "phase": "roofWood",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.5": {
      "slices": [
        {
          "phase": "roofTile",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.6": {
      "slices": [
        {
          "phase": "roofTile",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.7": {
      "slices": [
        {
          "phase": "roofWater",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.8": {
      "slices": [
        {
          "phase": "roofWater",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "8.9": {
      "slices": [
        {
          "phase": "roofEnd",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.1": {
      "slices": [
        {
          "phase": "chap1",
          "share": 0.25
        },
        {
          "phase": "chap2",
          "share": 0.25
        },
        {
          "phase": "chap3",
          "share": 0.25
        },
        {
          "phase": "chap4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.2": {
      "slices": [
        {
          "phase": "plaster1",
          "share": 0.25
        },
        {
          "phase": "plaster2",
          "share": 0.25
        },
        {
          "phase": "plaster3",
          "share": 0.25
        },
        {
          "phase": "plaster4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.3": {
      "slices": [
        {
          "phase": "plaster1",
          "share": 0.25
        },
        {
          "phase": "plaster2",
          "share": 0.25
        },
        {
          "phase": "plaster3",
          "share": 0.25
        },
        {
          "phase": "plaster4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.4": {
      "slices": [
        {
          "phase": "tile1",
          "share": 0.25
        },
        {
          "phase": "tile2",
          "share": 0.25
        },
        {
          "phase": "tile3",
          "share": 0.25
        },
        {
          "phase": "tile4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.5": {
      "slices": [
        {
          "phase": "putty1",
          "share": 0.25
        },
        {
          "phase": "putty2",
          "share": 0.25
        },
        {
          "phase": "putty3",
          "share": 0.25
        },
        {
          "phase": "putty4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.6": {
      "slices": [
        {
          "phase": "paint1",
          "share": 0.25
        },
        {
          "phase": "paint2",
          "share": 0.25
        },
        {
          "phase": "paint3",
          "share": 0.25
        },
        {
          "phase": "paint4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.7": {
      "slices": [
        {
          "phase": "primer1",
          "share": 0.25
        },
        {
          "phase": "primer2",
          "share": 0.25
        },
        {
          "phase": "primer3",
          "share": 0.25
        },
        {
          "phase": "primer4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.8": {
      "slices": [
        {
          "phase": "primer1",
          "share": 0.25
        },
        {
          "phase": "primer2",
          "share": 0.25
        },
        {
          "phase": "primer3",
          "share": 0.25
        },
        {
          "phase": "primer4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.9": {
      "slices": [
        {
          "phase": "paint1",
          "share": 0.25
        },
        {
          "phase": "paint2",
          "share": 0.25
        },
        {
          "phase": "paint3",
          "share": 0.25
        },
        {
          "phase": "paint4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "9.10": {
      "slices": [
        {
          "phase": "roughClose1",
          "share": 0.25
        },
        {
          "phase": "roughClose2",
          "share": 0.25
        },
        {
          "phase": "roughClose3",
          "share": 0.25
        },
        {
          "phase": "roughClose4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.1": {
      "slices": [
        {
          "phase": "extPlaster",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.2": {
      "slices": [
        {
          "phase": "extPlaster",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.3": {
      "slices": [
        {
          "phase": "extChap",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.4": {
      "slices": [
        {
          "phase": "extChap",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.5": {
      "slices": [
        {
          "phase": "extPrimer",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.6": {
      "slices": [
        {
          "phase": "extPrimer",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.7": {
      "slices": [
        {
          "phase": "extPaint",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "10.8": {
      "slices": [
        {
          "phase": "extPaint",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "11.1": {
      "slices": [
        {
          "phase": "chap1",
          "share": 0.25
        },
        {
          "phase": "chap2",
          "share": 0.25
        },
        {
          "phase": "chap3",
          "share": 0.25
        },
        {
          "phase": "chap4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "11.2": {
      "slices": [
        {
          "phase": "primer1",
          "share": 0.25
        },
        {
          "phase": "primer2",
          "share": 0.25
        },
        {
          "phase": "primer3",
          "share": 0.25
        },
        {
          "phase": "primer4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "11.3": {
      "slices": [
        {
          "phase": "paint1",
          "share": 0.25
        },
        {
          "phase": "paint2",
          "share": 0.25
        },
        {
          "phase": "paint3",
          "share": 0.25
        },
        {
          "phase": "paint4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "11.4": {
      "slices": [
        {
          "phase": "putty1",
          "share": 0.25
        },
        {
          "phase": "putty2",
          "share": 0.25
        },
        {
          "phase": "putty3",
          "share": 0.25
        },
        {
          "phase": "putty4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "11.5": {
      "slices": [
        {
          "phase": "plaster1",
          "share": 0.25
        },
        {
          "phase": "plaster2",
          "share": 0.25
        },
        {
          "phase": "plaster3",
          "share": 0.25
        },
        {
          "phase": "plaster4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "11.6": {
      "slices": [
        {
          "phase": "ceiling1",
          "share": 0.25
        },
        {
          "phase": "ceiling2",
          "share": 0.25
        },
        {
          "phase": "ceiling3",
          "share": 0.25
        },
        {
          "phase": "ceiling4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.1": {
      "slices": [
        {
          "phase": "baseFloor1",
          "share": 0.25
        },
        {
          "phase": "baseFloor2",
          "share": 0.25
        },
        {
          "phase": "baseFloor3",
          "share": 0.25
        },
        {
          "phase": "baseFloor4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.2": {
      "slices": [
        {
          "phase": "tile1",
          "share": 0.25
        },
        {
          "phase": "tile2",
          "share": 0.25
        },
        {
          "phase": "tile3",
          "share": 0.25
        },
        {
          "phase": "tile4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.3": {
      "slices": [
        {
          "phase": "tile1",
          "share": 0.25
        },
        {
          "phase": "tile2",
          "share": 0.25
        },
        {
          "phase": "tile3",
          "share": 0.25
        },
        {
          "phase": "tile4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.4": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.5": {
      "slices": [
        {
          "phase": "wet1",
          "share": 0.25
        },
        {
          "phase": "wet2",
          "share": 0.25
        },
        {
          "phase": "wet3",
          "share": 0.25
        },
        {
          "phase": "wet4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.6": {
      "slices": [
        {
          "phase": "tile1",
          "share": 0.25
        },
        {
          "phase": "tile2",
          "share": 0.25
        },
        {
          "phase": "tile3",
          "share": 0.25
        },
        {
          "phase": "tile4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "12.7": {
      "slices": [
        {
          "phase": "baldrameWater",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.1": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.2": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.3": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.4": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.5": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.6": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.7": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "13.8": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 1
        },
        {
          "name": "Servente",
          "hPerUnit": 1
        }
      ]
    },
    "13.9": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.1": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "14.2": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "14.3": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "14.4": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "14.5": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "14.6": {
      "slices": [
        {
          "phase": "roofEnd",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.7": {
      "slices": [
        {
          "phase": "roofEnd",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.8": {
      "slices": [
        {
          "phase": "roofEnd",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.9": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.10": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.11": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.12": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.13": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "14.14": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "15.1": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "15.2": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "15.3": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "15.4": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "16.1": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "16.2": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "16.3": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "16.4": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        },
        {
          "name": "Auxiliar de encanador ou bombeiro hidráulico",
          "hPerUnit": 0.3
        }
      ]
    },
    "16.5": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "16.6": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "16.7": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "16.8": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "16.9": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "16.10": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 6
        },
        {
          "name": "Servente",
          "hPerUnit": 12
        }
      ]
    },
    "17.1": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.2": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.3": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.4": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.5": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.6": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.7": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.8": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.9": {
      "slices": [
        {
          "phase": "spda",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "17.10": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.1": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.2": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.3": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Interligação de aterramento do quadro/entrada geral; evento 9.5."
    },
    "18.4": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.5": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.6": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.7": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.8": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.9": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.10": {
      "slices": [
        {
          "phase": "earth",
          "share": 1.0
        }
      ],
      "reason": "Haste de aterramento da entrada geral, antes das instalações definitivas."
    },
    "18.11": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.12": {
      "slices": [
        {
          "phase": "roughClose1",
          "share": 0.25
        },
        {
          "phase": "roughClose2",
          "share": 0.25
        },
        {
          "phase": "roughClose3",
          "share": 0.25
        },
        {
          "phase": "roughClose4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.13": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.14": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.15": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.16": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.17": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.18": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.19": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.20": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.21": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.22": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.23": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.24": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.25": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.26": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.27": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.28": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.29": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.30": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.31": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.32": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.33": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.34": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.35": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.36": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.37": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.38": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.39": {
      "slices": [
        {
          "phase": "steel1",
          "share": 0.25
        },
        {
          "phase": "steel2",
          "share": 0.25
        },
        {
          "phase": "steel3",
          "share": 0.25
        },
        {
          "phase": "steel4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.40": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.41": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.42": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.43": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.44": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.45": {
      "slices": [
        {
          "phase": "rough1",
          "share": 0.25
        },
        {
          "phase": "rough2",
          "share": 0.25
        },
        {
          "phase": "rough3",
          "share": 0.25
        },
        {
          "phase": "rough4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.46": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.47": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.48": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.49": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.50": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.51": {
      "slices": [
        {
          "phase": "externalNetworks",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.52": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.53": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "18.54": {
      "slices": [
        {
          "phase": "finalFit1",
          "share": 0.25
        },
        {
          "phase": "finalFit2",
          "share": 0.25
        },
        {
          "phase": "finalFit3",
          "share": 0.25
        },
        {
          "phase": "finalFit4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.1": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Encanador ou bombeiro hidráulico",
          "hPerUnit": 8
        },
        {
          "name": "Servente",
          "hPerUnit": 8
        }
      ]
    },
    "19.2": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.3": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.4": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.5": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.6": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.7": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "19.8": {
      "slices": [
        {
          "phase": "gas",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Pedreiro",
          "hPerUnit": 8
        },
        {
          "name": "Servente",
          "hPerUnit": 8
        }
      ]
    },
    "20.1": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "20.2": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "20.3": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "20.4": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "20.5": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "20.6": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "21.1": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Eletricista",
          "hPerUnit": 2
        },
        {
          "name": "Auxiliar de eletricista",
          "hPerUnit": 2
        }
      ]
    },
    "21.2": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Eletricista",
          "hPerUnit": 2
        },
        {
          "name": "Auxiliar de eletricista",
          "hPerUnit": 2
        }
      ]
    },
    "21.3": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Eletricista",
          "hPerUnit": 0.08
        },
        {
          "name": "Auxiliar de eletricista",
          "hPerUnit": 0.08
        }
      ]
    },
    "21.4": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Eletricista",
          "hPerUnit": 0.4
        },
        {
          "name": "Auxiliar de eletricista",
          "hPerUnit": 0.4
        }
      ]
    },
    "22.1": {
      "slices": [
        {
          "phase": "wall",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Pedreiro",
          "hPerUnit": 2.5
        },
        {
          "name": "Servente",
          "hPerUnit": 1.5
        }
      ]
    },
    "22.2": {
      "slices": [
        {
          "phase": "wall",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas. Carga complementar estimada em h/un; não é coeficiente SINAPI e não altera custos nem créditos.",
      "estimated": [
        {
          "name": "Serralheiro",
          "hPerUnit": 0.5
        },
        {
          "name": "Auxiliar de serralheiro",
          "hPerUnit": 0.5
        }
      ]
    },
    "22.3": {
      "slices": [
        {
          "phase": "landscape",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "22.4": {
      "slices": [
        {
          "phase": "landscape",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "22.5": {
      "slices": [
        {
          "phase": "landscape",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "22.6": {
      "slices": [
        {
          "phase": "landscape",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "22.7": {
      "slices": [
        {
          "phase": "wall",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "22.8": {
      "slices": [
        {
          "phase": "landscape",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.1": {
      "slices": [
        {
          "phase": "safetyFinal",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.2": {
      "slices": [
        {
          "phase": "wet1",
          "share": 0.25
        },
        {
          "phase": "wet2",
          "share": 0.25
        },
        {
          "phase": "wet3",
          "share": 0.25
        },
        {
          "phase": "wet4",
          "share": 0.25
        }
      ],
      "reason": "Distribuição didática de 25% da quantidade por pavimento; sem levantamento por andar disponível. Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.3": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.4": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.5": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.6": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.7": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.8": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.9": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.10": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.11": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.12": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.13": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.14": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.15": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.16": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.17": {
      "slices": [
        {
          "phase": "paving",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.18": {
      "slices": [
        {
          "phase": "cleanup",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.19": {
      "slices": [
        {
          "phase": "handover",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    },
    "23.20": {
      "slices": [
        {
          "phase": "handover",
          "share": 1.0
        }
      ],
      "reason": "Serviço alocado à frente compatível com sua descrição e precedências construtivas."
    }
  }
};
P.roles={armador:'Armador',carpinteiro:'Carpinteiro',pedreiro:'Pedreiro',servente:'Servente',ajudante:'Ajudante / auxiliar',encanador:'Encanador / bombeiro hidráulico',eletricista:'Eletricista',pintor:'Pintor',gesseiro:'Gesseiro',azulejista:'Azulejista / ladrilhista',impermeabilizador:'Impermeabilizador',montador:'Montador',serralheiro:'Serralheiro',vidraceiro:'Vidraceiro',telhadista:'Telhadista',jardineiro:'Jardineiro',outros:'Outras funções',equipamento:'Equipamento'};
P.role=function(name,kind){if(kind==='eq')return 'equipamento';const s=U.norm(name);if(/AJUDANTE|AUXILIAR/.test(s))return 'ajudante';for(const [re,k] of [[/ARMADOR/,'armador'],[/CARPINTEIRO/,'carpinteiro'],[/PEDREIRO/,'pedreiro'],[/SERVENTE/,'servente'],[/ENCANADOR|BOMBEIRO HIDRAUL/,'encanador'],[/ELETRICISTA/,'eletricista'],[/PINTOR/,'pintor'],[/GESSEIRO/,'gesseiro'],[/AZULEJISTA|LADRILHISTA/,'azulejista'],[/IMPERMEABILIZADOR/,'impermeabilizador'],[/MONTADOR/,'montador'],[/SERRALHEIRO/,'serralheiro'],[/VIDRACEIRO/,'vidraceiro'],[/TELHADISTA/,'telhadista'],[/JARDINEIRO/,'jardineiro']])if(re.test(s))return k;return 'outros';};
P.sum=(a,fn=x=>x)=>a.reduce((s,x)=>s+fn(x),0);
P.allocate=function(total,weights){total=Math.round(total);const s=P.sum(weights),sign=total<0?-1:1,t=Math.abs(total);if(!weights.length)return[];if(!(s>0))return weights.map((_,i)=>i?0:total);const exact=weights.map(x=>t*x/s),a=exact.map(Math.floor);let rest=t-P.sum(a);exact.map((x,i)=>({i,r:x-a[i]})).sort((a,b)=>b.r-a.r||a.i-b.i).slice(0,rest).forEach(x=>a[x.i]++);return a.map(x=>x*sign);};
const eachItem=(pj,fn)=>{const visit=n=>(n.children||[]).forEach(c=>c.kind==='stage'?visit(c):fn(c));visit(pj.root);};
// Preços oficiais permanecem vivos. Uma substituição manual do usuário cancela só o vínculo daquele item.
P.syncPrices=function(base,pj){eachItem(pj,it=>{const l=it.referenceLink;if(!l||String(l.code)!==String(it.code))return;
 if(it.custo!=null&&l.lastAutoCost!==it.custo){delete it.referenceLink;return;}
 const c=base.comp(it.code),price=c?base.compCost(it.code,pj.uf,pj.rg):null;
 if(price!=null){delete it.custo;l.lastAutoCost=null;l.state='referência ativa';}
 else{it.custo=l.fallbackCost;l.lastAutoCost=it.custo;l.state='valor histórico preservado — preço ativo incompleto';}
});};
// Consumos horários: recursos principais + auxiliares; cada operador embutido é acrescentado uma única vez.
P.workload=function(base,r){
 const w=r.node.work||{},res=r.comp?OP.prod.resources(base,r.node.code):{direct:[],support:[]},out=[];
 const add=(x,support)=>{if(!(x.h>0))return;out.push({name:x.name,kind:x.kind,role:P.role(x.name,x.kind),h:r.qty*x.h,coef:x.h,source:'coeficiente analítico',support,operator:false});if(x.kind==='eq'&&x.operator)out.push({name:x.operator,kind:'op',role:P.role(x.operator,'mo'),h:r.qty*x.h,coef:x.h,source:'operador embutido no custo horário',support,operator:true});};
 res.direct.forEach(x=>add(x,false));res.support.forEach(x=>add(x,true));
 // Estimativas só suprem trabalho sem analítico; não são somadas novamente a trabalho oficial existente.
 if(!out.some(x=>x.kind==='mo')&&(w.estimated||[]).length)for(const x of w.estimated)out.push({name:x.name,kind:'mo',role:P.role(x.name,'mo'),h:r.qty*x.hPerUnit,coef:x.hPerUnit,source:'hipótese de planejamento (não SINAPI)',support:false,estimated:true});
 return out;
};
P.makeSchedule=function(m){
 const cfg=m.pj.sitePlan,phases=clone(cfg.phases),by=new Map(phases.map(x=>[x.id,x])),issues=[];const capDefault={carpinteiro:4,pedreiro:3,servente:4,armador:3,ajudante:2,eletricista:2,encanador:2,outros:2,equipamento:1};
 phases.forEach(p=>{p.hours={};p.itemIds=[];p.cost=0;p.price=0;p.crew={...capDefault,...p.crew};});
 for(const r of m.items){r.planLoads=P.workload(m.base,r);const w=r.node.work;
  if(!w){issues.push('Item '+r.num+' sem mapeamento de frente. Alocado provisoriamente à entrega.');r.planMapping={slices:[{phase:'handover',share:1}],reason:'Novo item sem planejamento: revise a alocação.'};}else r.planMapping=w;
  const slices=r.planMapping.slices||[];
  const totalShare=P.sum(slices,x=>x.share);if(slices.length&&Math.abs(totalShare-1)>1e-8)issues.push('Frações do item '+r.num+' não somam 100%.');
  for(const s of slices){const p=by.get(s.phase);if(!p){issues.push('Frente não encontrada: '+s.phase+' no item '+r.num);continue;}p.itemIds.push(r.id);p.cost+=r.direct*s.share;p.price+=r.total*s.share;
   for(const x of r.planLoads){const key=x.kind==='eq'?'eq:'+U.norm(x.name):x.role;p.hours[key]=(p.hours[key]||0)+x.h*s.share;}
  }
 }
 for(const p of phases){let minWork=0,bottleneck='reserva mínima';for(const [key,h]of Object.entries(p.hours)){const role=key.startsWith('eq:')?'equipamento':key;const cap=Math.max(.1,Number(p.crew[role])||capDefault[role]||2);const days=Math.ceil(h/(cap*m.J)-1e-9);if(days>minWork){minWork=days;bottleneck=P.roles[role]||role;}}
  p.workDays=minWork;p.days=Math.max(1,Math.ceil(+p.minDays||1),minWork);p.bottleneck=p.days>minWork?'janela mínima planejada':bottleneck;
 }
 const links=clone(cfg.links);for(const l of links){if(!by.has(l.from)||!by.has(l.to))issues.push('Vínculo com frente inexistente: '+l.from+' → '+l.to);}
 const cp=OP.cpm.run(phases.map(p=>({id:p.id,dur:p.days})),links);
 if(cp.cycle)issues.push('Ciclo nas frentes: '+cp.cycle.join(', '));
 phases.forEach((p,i)=>{for(const k of ['ES','EF','LS','LF','TF','FF','crit'])p[k]=cp[k][i];p.start=m.cal.date(p.ES);p.end=m.cal.date(p.EF-1);p.num=String(i+1);});
 for(const r of m.items){const w=r.planMapping;
  let seg=[];
  if(w.span){const a=by.get(w.span.start),b=by.get(w.span.end);if(a&&b&&b.EF>a.ES){seg=[{phase:w.span.start+'→'+w.span.end,share:1,ES:a.ES,EF:b.EF,LS:a.ES,LF:b.EF,continuous:true}];}else issues.push('Janela inválida no item '+r.num);}
  else seg=(w.slices||[]).filter(x=>by.has(x.phase)).map(s=>{const p=by.get(s.phase);return{phase:s.phase,share:s.share,ES:p.ES,EF:p.EF,LS:p.LS,LF:p.LF};});
  if(!seg.length)seg=[{phase:'handover',share:1,ES:cp.T-1,EF:cp.T,LS:cp.T-1,LF:cp.T}];
  r.workSegments=seg;r.ES=Math.min(...seg.map(s=>s.ES));r.EF=Math.max(...seg.map(s=>s.EF));r.LS=Math.min(...seg.map(s=>s.LS));r.LF=Math.max(...seg.map(s=>s.LF));r.TF=Math.max(0,Math.min(...seg.map(s=>s.LS-s.ES)));r.FF=r.TF;r.crit=r.TF===0&&!w.span;r.days=r.EF-r.ES;r.activeDays=new Set(seg.flatMap(s=>Array.from({length:Math.max(0,s.EF-s.ES)},(_,i)=>s.ES+i))).size;
  r.start=m.cal.date(r.ES);r.end=m.cal.date(Math.max(r.ES,r.EF-1));r.lstart=m.cal.date(r.LS);r.lend=m.cal.date(Math.max(r.LS,r.LF-1));
  // O analítico de referência continua intacto; estes campos registram o planejamento aplicado.
  r.referenceProdDays=r.prod.days;r.prod={...r.prod,days:r.days,planned:true};
 }
 m.T=cp.T;m.end=m.cal.date(Math.max(0,m.T-1));m.start=m.cal.start;m.plan={phases,by,cp,issues};m.links=[];
 m.cpm={...cp,phaseLevel:true,order:m.items.map((_,i)=>i).sort((a,b)=>m.items[a].ES-m.items[b].ES),D:m.items.map(r=>r.days),...Object.fromEntries(['ES','EF','LS','LF','TF','FF','crit'].map(k=>[k,m.items.map(r=>r[k])])),links:[]};
 for(const s of m.stages.slice().reverse()){const leaf=s.leaf;s.ES=leaf.length?Math.min(...leaf.map(r=>r.ES)):0;s.EF=leaf.length?Math.max(...leaf.map(r=>r.EF)):0;s.LS=leaf.length?Math.min(...leaf.map(r=>r.LS)):0;s.LF=leaf.length?Math.max(...leaf.map(r=>r.LF)):0;s.TF=Math.max(0,s.LS-s.ES);s.FF=s.TF;s.days=s.EF-s.ES;s.crit=leaf.some(r=>r.crit);s.start=m.cal.date(s.ES);s.end=m.cal.date(Math.max(s.ES,s.EF-1));s.lstart=m.cal.date(s.LS);s.lend=m.cal.date(Math.max(s.LS,s.LF-1));}
 return m;
};
const eventDates0=OP.evt.previsto;
OP.evt.previsto=function(m,ev){if(!m.plan&&m.execution)m={...m,plan:m.execution};if(!m.plan)return eventDates0(m,ev);const out=new Map();for(const e of ev.events){let floor=null,a=/^(?:3|4|11|20)\.([1-4])$/.exec(e.code),b=/^9\.([1-4])(?:\.[12])?$/.exec(e.code),c=/^13\.[123]\.([1-4])$/.exec(e.code);floor=(a||b||c)?.[1]||null;let end=null;for(const id of e.items){const r=m.byId.get(id);if(!r)continue;for(const seg of r.workSegments){const f=/([1-4])$/.exec(seg.phase)?.[1];if(floor&&f&&floor!==f)continue;const d=m.cal.date(m.execution?Math.ceil(seg.EF-1e-8)-1:seg.EF-1);if(end==null||d>end)end=d;}}const release=/^3\.([1-4])$/.exec(e.code);if(release){const p=m.plan.by.get('cure'+release[1]);if(p&&(!end||p.end>end))end=p.end;}if(end)out.set(e.code,Math.round((end-m.start)/86400000)+1);}return out;};
const compute0=E.compute;
P.computeLegacy=compute0;
E.compute=function(base,pj){P.syncPrices(base,pj);let m=compute0(base,pj);if(!pj.sitePlan||pj.sitePlan.v!==1)return m;
 P.makeSchedule(m);let changed=false;
 for(const r of m.items){const t=r.node.work?.periodic;if(!t||t.enabled===false){delete r.node.periodMemo;continue;}const days=Math.round((Date.UTC(r.end.getFullYear(),r.end.getMonth(),r.end.getDate())-Date.UTC(r.start.getFullYear(),r.start.getMonth(),r.start.getDate()))/86400000)+1;const qty=Math.round(days/30*t.multiplier*1e6)/1e6;
  if(Math.abs(r.node.qty-qty)>5e-7){r.node.qty=qty;changed=true;}r.node.periodMemo={calendarDays:days,months:days/30,multiplier:t.multiplier,quantity:qty,rule:'meses equivalentes = dias corridos inclusivos / 30 (hipótese didática; conferir faturamento)'};
 }
 if(changed){m=compute0(base,pj);P.makeSchedule(m);}
 if(pj.sanitation){pj.sanitation.current={ref:base.raw.ref,uf:pj.uf,rg:pj.rg,direct:m.tot.direct,price:m.tot.price,days:m.T,start:U.iso(m.start),end:U.iso(m.end)};}
 // Eventos continuam como marcos financeiros, não como segunda rede de execução.
 if(pj.sitePlan.syncEvents!==false&&pj.evt){const ev=OP.evt.compute(m,pj);const map=OP.evt.previsto(m,ev);for(const e of pj.evt.events)if(map.has(e.code))e.prazo=map.get(e.code);const totalDays=Math.round((m.end-m.start)/86400000)+1;for(const f of pj.evt.fixos||[])f.prazo=totalDays+(/definitivo/i.test(f.desc)?30:0);}
 return m;
};
// Série financeira em centavos, conservando exatamente os totais até na distribuição mensal.
P.itemMoney=function(r,T,late,withBDI){const result=new Float64Array(T),parts=P.allocate(withBDI?r.total:r.direct,r.workSegments.map(s=>s.share));r.workSegments.forEach((s,i)=>{const start=late?s.LS:s.ES,end=late?s.LF:s.EF,n=Math.max(1,end-start);const alloc=P.allocate(parts[i],Array(n).fill(1));for(let j=0;j<n;j++)result[Math.min(T-1,Math.max(0,start+j))]+=alloc[j];});return result;};
const daily0=R.daily,ff0=R.fisfin;
const dailyCache=new WeakMap();
R.daily=function(m,o={}){if(!m.plan)return daily0(m,o);const key=[o.sched,o.support,o.operators].join('|');let cache=dailyCache.get(m);if(!cache)dailyCache.set(m,cache=new Map());if(cache.has(key))return cache.get(key);
 const late=o.sched==='late',T=Math.max(1,m.T),labor=new Map(),equip=new Map(),cost=new Float64Array(T),price=new Float64Array(T);
 const add=(map,name,kind,h,start,end,source)=>{if(!(h>0)||end<=start)return;const key=(kind==='eq'?'E:':'L:')+U.norm(name);let v=map.get(key);if(!v){v={key,name,kind,daily:new Float64Array(T),hours:0,technicalHours:0,estimatedHours:0};map.set(key,v);}v.hours+=h;if(source==='hypothesis')v.estimatedHours+=h;else v.technicalHours+=h;const rate=h/((end-start)*m.J);for(let t=start;t<end&&t<T;t++)if(t>=0)v.daily[t]+=rate;};
 for(const r of m.items){const dc=P.itemMoney(r,T,late,false),dp=P.itemMoney(r,T,late,true);for(let i=0;i<T;i++){cost[i]+=dc[i];price[i]+=dp[i];}
  const w=r.planMapping;
  for(const a of w.availability||[]){const s=r.workSegments[0];add(equip,a.name,'eq',a.units*(s.EF-s.ES)*m.J,s.ES,s.EF,'hypothesis');}
  if(w.staff){for(const x of w.staff){const s=r.workSegments[0];add(labor,x.name,'mo',x.fte*(s.EF-s.ES)*m.J,s.ES,s.EF,'hypothesis');}continue;}
  for(const s of r.workSegments)for(const x of r.planLoads){if(x.support&&o.support===false||x.operator&&o.operators===false)continue;add(x.kind==='eq'?equip:labor,x.name,x.kind,x.h*s.share,late?s.LS:s.ES,late?s.LF:s.EF,x.estimated?'hypothesis':'analytic');}
 }
 const ans={T,labor:[...labor.values()].sort((a,b)=>b.hours-a.hours),equip:[...equip.values()].sort((a,b)=>b.hours-a.hours),cost,price,method:'horas distribuídas nas campanhas; pessoas-equivalentes, sem somar equipes inteiras por linha'};cache.set(key,ans);return ans;
};
R.fisfin=function(m,B,withBDI){if(!m.plan)return ff0(m,B,withBDI);const rows=m.flat.filter(r=>!r.parent).map(s=>{const vals=B.map(()=>0);for(const r of s.isStage?s.leaf:[s]){const v=P.itemMoney(r,m.T,false,withBDI);for(let t=0;t<m.T;t++)vals[B.dayIdx[t]]+=v[t];}return{num:s.num,name:s.isStage?s.node.name:s.desc,vals,total:P.sum(vals)};});const col=B.map((_,i)=>P.sum(rows,r=>r.vals[i])),total=P.sum(col);let a=0;return{rows,col,total,pct:col.map(x=>x/(total||1)),cum:col.map(x=>(a+=x)/(total||1))};};
const legacy=OP.examples.build;P.buildHistorical=(base)=>legacy('edificio',base);
P.buildExample=function(base){
 const raw=base.officialRaw||base.raw;if(raw.ref!=='08/2026')throw new Error('O exemplo saneado requer a base incorporada SINAPI 08/2026.');
 const b0=N.makeBase(raw,base.id,[],[]),pj=legacy('edificio',b0),old=compute0(b0,pj);pj.uf='SP';pj.rg='CD';pj.start='2026-10-05';pj.seq='manual';pj.links=[];pj.calendar={...OP.cal.DEFAULT,workdays:[1,2,3,4,5],hpd:8.8,extra:[]};
 pj.name='Edifício residencial multifamiliar — 4 pavimentos (Curso SINAPI Avançado 2026) · SP 08/2026';pj.info={local:'São Paulo (SP)',autor:'Exemplo didático — responsável técnico não informado',precoBase:'SINAPI agosto/2026 · referências externas históricas identificadas',encargos:{horista:N.charge(raw,'SP','CD','H'),mensalista:N.charge(raw,'SP','CD','MES')}};
 pj.catalog={v:1,inputs:[],compositions:[]};pj.sitePlan={v:1,phases:clone(P.spec.phases),links:clone(P.spec.links),syncEvents:true};
 pj.sanitation={version:'1.8.2',target:'SINAPI SP 08/2026 · CD',original:{name:OP.examples.edificio.meta.nome,uf:'DF',ref:'12/2025',direct:old.tot.direct,price:old.tot.price,days:old.T},audit:[],assumptions:[
 'Quantidades físicas do projeto original preservadas, salvo itens mensais: administração, contêineres, andaime e elevador, vinculados ao novo prazo.',
 'Divisão por pavimento em quatro parcelas iguais onde não há levantamento por andar. São frações didáticas, não nova medição de projeto.',
 'Duração das frentes = maior entre janela mínima inferida e horas agregadas / capacidade por função / jornada. Não é otimização global de recursos.',
 'Reservas de cura, secagem, testes e liberação são janelas didáticas, não autorização técnica de desforma ou carregamento.',
 'BDI histórico de 26,2214365622% preservado para comparação. Sua composição tributária original não foi recalculada/validada para SP em 2026.',
 'Elevador: cotação original descreve tração a cabo; montagem/ascensão SINAPI descrevem cremalheira. Prazo compatibilizado, tecnologia e preço ainda exigem cotação compatível.',
 'Aluguéis/administração proporcionalizados por dias corridos / 30; não é convenção universal de faturamento. Demais consumos e custos não são criados para reservas de controle.',
 'Calendário didático: segunda a sexta, 8,8 h/dia; feriados do calendário interno. Feriados locais, turnos e meteorologia não foram acrescentados.',
 'Histogramas de demanda em pessoas-equivalentes por função. Não são folha de ponto, efetivo contratado, produtividade garantida ou soma de trabalhadores inteiros por item.',
 'Eventograma: controle tecnológico compartilhado, custos de apoios continuados e campanhas de montagem/retirada são diluídos, sem pagar toda a locação no marco inicial. A curva de pagamentos por eventos não é a curva de consumo de custos. Recebimento definitivo: reserva didática de 30 dias corridos após entrega, sem prolongar automaticamente a equipe de execução.',
 'As condições geométricas e de segurança do projeto não foram validadas: o saneamento é de referências, preços, vínculos e premissas de planejamento.'
 ]};
 const addInput=(code,desc,unit,price,cls='SERVIÇOS',profile='')=>{let x=pj.catalog.inputs.find(x=>x.code===code);if(x)return code;x={...N.newInput(),id:code,code,desc,unit,cls,source:'Memória/cotação histórica do exemplo (DF, dezembro/2025)',notes:'Valor histórico preservado por ausência de cotação SINAPI SP suficiente. Não é preço oficial atualizado. Conferir antes de uso real.',taxProfile:profile,revision:1};x.prices=[{uf:'*',ref:'',date:'',base:price,sd:cls==='MAO DE OBRA'?price:null,cd:cls==='MAO DE OBRA'?price:null,se:null,source:x.source}];pj.catalog.inputs.push(x);return code;};
 const comp=(code,desc,unit,items,notes='')=>{const c={...N.newComp(),id:code,code,desc,unit,items,source:'Memória técnica do exemplo; insumos/auxiliares vinculados à base ativa',notes,revision:1};pj.catalog.compositions.push(c);return code;};
 const I=(code,coef)=>({type:'I',code,coef}),C=(code,coef)=>({type:'C',code,coef});
 comp('CP-ED-MOB','Mobilização — memória do exemplo reprecificada','UN',[C(5824,3),C(5826,5),C(88316,16)],'Coeficientes da memória original. Aplicável à mobilização e à desmobilização do exemplo, sem duplicação de quantidades.');
 const adm=[C(93565,.2),C(94295,1),C(101452,.5),I(addInput('IP-ED-VIGIA-N','Vigia noturno — custo mensal histórico','MES',5567.2446,'MAO DE OBRA','maoObra'),1)];
 for(const [code,desc,value]of[['ENERGIA','Energia do canteiro — provisão mensal histórica',1443.52],['AGUA','Água e esgoto — provisão mensal histórica',2397.398],['TEL','Comunicações — provisão mensal histórica',400],['ESCR','Material de escritório — provisão mensal histórica',60],['LIMP','Material de limpeza — provisão mensal histórica',45]])adm.push(I(addInput('IP-ED-'+code,desc,'MES',value),1));
 comp('CP-ED-ADM','Administração local da obra — mês equivalente','MES',adm,'Equipe mensal: engenheiro 0,20; mestre 1,00; servente 0,50 e vigia noturno 1,00. Não foram reconstruídos consumos físicos de utilidades: a memória original contém totais/quantidades inconsistentes; preservadas provisões mensais = total histórico / 10.');
 const mo=OP.examples.edificio.memos,number=x=>typeof x==='number'?x:Number(String(x).replace(',','.'));
 for(const [key,code,desc,unit]of[['estaca','CP-ED-ESTACA30','Estaca hélice contínua Ø30 cm — concreto fck30 MPa e armação da memória','M'],['espelho','CP-ED-ESPELHO','Espelho 4 mm — composição ajustada do exemplo','M2'],['bomba','CP-ED-BOMBAS','Conjunto de duas bombas 1,5 CV com quadro — memória do exemplo','UN']]){
  const items=[];for(const row of mo[key].rows){if(!['COMPOSICAO','INSUMO'].includes(row[0]))continue;let ref=+row[1],qty=number(row[4]),price=number(row[5]);if(!(qty>0))continue;if(key==='estaca'&&[90776,90778].includes(ref))continue;
   if(row[0]==='INSUMO'){const inf=b0.ins(ref),p=inf?b0.insPrice(inf.i,b0.ufIndex('SP'),'CD')[0]:null;if(p==null){ref=addInput('IP-ED-HIST-'+ref,row[2],row[3],price,'MATERIAL','material');}items.push(I(ref,qty));}
   else if(ref===102134&&b0.compCost(ref,'SP','CD')==null){const c={...N.newComp(),code:'CP-ED-QUADRO',id:'CP-ED-QUADRO',desc:row[2],unit:row[3],mode:'quoted',quote:price,quoteUF:'*',source:'Memória histórica: quadro completo a R$ 2.800,00; referência atual incompleta',notes:'Não atribui R$ 2.800,00 ao insumo 44381: o valor histórico é do conjunto instalado. Crédito não determinado sem analítico completo.',revision:1};pj.catalog.compositions.push(c);items.push(C(c.code,qty));}
   else items.push(C(ref,qty));
  }
  comp(code,desc,unit,items,'Coeficientes e especificações da memória original preservados; preços SINAPI ativos onde disponíveis. '+(key==='estaca'?'Engenheiro pleno e encarregado estavam zerados na memória: exclusão original mantida e administração medida separadamente. Não confundir fck30 ajustado com composição padrão fck20.':'Lacunas de cotação substituídas apenas pelos valores históricos expressamente existentes na memória.'));
 }
 const setRef=(it,code,fallback,reason)=>{it.code=code;const c=b0.comp(code);delete it.custo;it.fonte='SINAPI';it.desc=c.desc;it.unit=c.unit;it.referenceLink={code,fallbackCost:fallback,lastAutoCost:null,state:'referência ativa'};it.sanitationReason=reason;};
 for(const r of old.items){const it=r.node,original={code:it.code,fonte:it.fonte,desc:it.desc,unit:it.unit,qty:it.qty,custo:it.custo,evento:it.evento};it.work=clone(P.spec.items[r.num]);it.crew=null;it.teams=1;it.target=null;it.dur=null;it.originalNumber=r.num;let policy='externo preservado',reason='Cotação, tabela externa ou referência ausente na base ativa. Valor original preservado; não substituído por mera semelhança de código.';
  if(r.num==='1.18'){it.code='CP-ED-ADM';it.unit='MES';it.desc='Administração local da obra — mês equivalente';delete it.custo;it.fonte='PRÓPRIA';delete it.memo;policy='própria reconstituída';reason='Memória mensal recomposta, salários disponíveis atualizados por SINAPI e provisões externas preservadas. Prazo acompanha o contrato.';}
  else if(['1.2','23.18','4.2.2','13.9','14.13'].includes(r.num)){const map={'1.2':'CP-ED-MOB','23.18':'CP-ED-MOB','4.2.2':'CP-ED-ESTACA30','13.9':'CP-ED-ESPELHO','14.13':'CP-ED-BOMBAS'};it.code=map[r.num];delete it.custo;delete it.desc;delete it.unit;delete it.memo;it.fonte='PRÓPRIA';policy='própria reconstituída';reason='Analítico reconstituído da memória original, preservando especificação e coeficientes. Referências SINAPI ligadas a UF/regime e exceções históricas identificadas.';}
  else if(r.num==='19.2'){setRef(it,107284,original.custo,'Substituição do código 101936 por 107284: mesma central, 4 pavimentos/16 unidades/DN32, composição ativa AF_07/2026.');policy='referência substituída';reason=it.sanitationReason;}
  else if((/SINAPI/.test(String(it.fonte))||r.num==='19.3')&&b0.comp(it.code)){setRef(it,it.code,original.custo,'Código existente: custo, descrição e unidade vinculados à base ativa.');policy='SINAPI vinculado';reason=it.sanitationReason;if(b0.compCost(it.code,'SP','CD')==null){policy='SINAPI incompleto';it.custo=original.custo;it.referenceLink.lastAutoCost=it.custo;reason='Código disponível, mas analítico sem cotação completa em SP; valor histórico integral preservado, sem inventar preço para insumos faltantes.';}}
  else if(/SINAPI/.test(String(it.fonte))&&b0.ins(it.code)){const code='CP-ED-REF-'+it.code,inf=b0.ins(it.code);if(!pj.catalog.compositions.some(x=>x.code===code))comp(code,inf.desc,inf.unit,[I(inf.code,1)],'Ponte de fornecimento direto: 1 unidade do insumo SINAPI, sem coeficiente de mão de obra inventado.');it.code=code;it.desc=inf.desc;it.unit=inf.unit;it.fonte='PRÓPRIA';delete it.custo;policy='insumo SINAPI vinculado';reason='Insumo direto envolvido por composição de fornecimento coeficiente 1: preço varia automaticamente com UF/base.';}
  if(r.num==='23.18')it.desc='Desmobilização — memória do exemplo reprecificada';
  if(/^2\.[1-8]$/.test(r.num))it.evento='Diluído';else if(['1.12','1.13','1.14','1.15','1.19','1.20','1.21','1.24','1.25'].includes(r.num))it.evento='Diluído';else if(r.num==='1.22')it.evento='2.2';else if(!it.evento&&it.sug)it.evento=it.sug;
  it.sanitationReason=reason;pj.sanitation.audit.push({id:it.id,num:r.num,original,policy,reason,newCode:it.code});
 }
 pj.bdiCfg.applied.p.metodo='histórico do curso — mantido, sem revisão fiscal';pj.bdiCfg.applied.p.memo='BDI histórico preservado exclusivamente para comparação de custos; conferir composição tributária e enquadramento municipal antes de uso contratual.';
 pj.memosHistorical=clone(pj.memos);pj.memos={}; // memórias obsoletas não são exibidas como custo vigente
 const b=N.makeBase(raw,base.id,pj.catalog.inputs,pj.catalog.compositions);E.compute(b,pj);return pj;
};
OP.examples.build=function(key,base){return key==='edificio'?P.buildExample(base):legacy(key,base);};
})(typeof window!=='undefined'?window:globalThis);



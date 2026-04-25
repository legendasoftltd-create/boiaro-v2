import { prisma } from "../lib/prisma.js";

export const getFooterData = async(req, res)=>{
    

    const footerData = await prisma.siteSetting.findMany({
        
        
    });

    return{
        footerData
    }
}